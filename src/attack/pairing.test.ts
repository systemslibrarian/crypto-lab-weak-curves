/**
 * The expected α and β below are a reference table computed OUTSIDE this
 * repository, with a separate implementation of the reduced Tate pairing and
 * the distortion map φ(x, y) = (−x, i·y), and written (a, b) for a + b·i.
 *
 * No publication prints these instances, so the table alone would be a weak
 * oracle — it could only say this code still agrees with one other program.
 * What makes them trustworthy is the SELF-CERTIFYING checks beside it: l·P = R
 * by scalar multiplication, n·P = O, α^n = 1, α ≠ 1, β = α^l and bilinearity,
 * none of which depends on the table being right.
 */
import { describe, expect, it } from 'vitest';
import { distort, embed, finalExponent, isOnCurveFp2, millerLoop, mulFp2, reducedTate } from './pairing';
import { mul } from '../ec/curve';
import { isProbablePrime } from '../ec/field';
import { makeFp2 } from '../ec/fp2';
import { MOV_INSTANCES } from '../data/published';
import { randomScalar } from '../secret/random';
import { seededSource } from '../testing/seeded';

const EXPECTED = {
  16: { alpha: [27820n, 160710n], beta: [55878n, 188177n] },
  24: { alpha: [38899672n, 2644463n], beta: [20380735n, 43044064n] },
  32: { alpha: [9379033143n, 15056693963n], beta: [33616345526n, 4406022279n] },
} as const;

describe('the reduced Tate pairing with the distortion map', () => {
  for (const instance of MOV_INSTANCES) {
    const { bits, p, n, P, R, secret } = instance;
    const curve = { p, a4: 1n };
    const weierstrass = { p, a2: 0n, a4: 1n, a6: 0n };

    describe(`n of ${bits} bits: p = ${p}, n = ${n}`, () => {
      it('p is prime and ≡ 3 (mod 4); n is prime and divides p + 1 with the stated cofactor', () => {
        expect(isProbablePrime(p)).toBe(true);
        expect(p % 4n).toBe(3n);
        expect(isProbablePrime(n)).toBe(true);
        expect((p + 1n) % n).toBe(0n);
        expect((p + 1n) / n).toBe(bits === 32 ? 28n : 4n);
      });

      it('n·P = O and l·P = R by scalar multiplication (the self-certifying check)', () => {
        expect(mul(weierstrass, n, P).point).toBeNull();
        expect(mul(weierstrass, secret, P).point).toEqual(R);
      });

      it('φ(P) is on the curve over F_{p²} and has order n', () => {
        const F = makeFp2(p);
        const phi = distort(F, P);
        expect(isOnCurveFp2(F, curve, phi)).toBe(true);
        expect(mulFp2(F, curve, n, phi)).toBeNull();
        expect(mulFp2(F, curve, 1n, phi)).not.toBeNull();
      });

      it(`α = t(P, φ(P)) and β = t(R, φ(P)) match the reference table`, () => {
        const F = makeFp2(p);
        const phi = distort(F, P)!;
        const alpha = reducedTate(F, curve, n, P, phi).value;
        const beta = reducedTate(F, curve, n, R, phi).value;
        expect([alpha.a, alpha.b]).toEqual(EXPECTED[bits].alpha);
        expect([beta.a, beta.b]).toEqual(EXPECTED[bits].beta);
      });

      it('α^n = 1, α ≠ 1, and β = α^l', () => {
        const F = makeFp2(p);
        const phi = distort(F, P)!;
        const alpha = reducedTate(F, curve, n, P, phi).value;
        const beta = reducedTate(F, curve, n, R, phi).value;
        expect(F.isOne(F.pow(alpha, n))).toBe(true);
        expect(F.isOne(alpha)).toBe(false);
        expect(F.eq(F.pow(alpha, secret), beta)).toBe(true);
      });

      it('the final exponent is (p² − 1)/n and the Miller loop has one row per bit plus one per set bit', () => {
        const F = makeFp2(p);
        const phi = distort(F, P)!;
        const result = reducedTate(F, curve, n, P, phi);
        expect(result.exponent).toBe((p * p - 1n) / n);
        const bitString = n.toString(2);
        const ones = bitString.slice(1).split('').filter((b) => b === '1').length;
        expect(result.miller.rows).toHaveLength(bitString.length - 1 + ones);
        expect(result.miller.rows.at(-1)!.T).toBeNull(); // the chain ends at n·P = O
      });
    });
  }

  it('is bilinear: t(aP, φ(P)) = t(P, φ(P))^a for twenty seeded random a on the 16-bit instance', () => {
    const { p, n, P } = MOV_INSTANCES[0];
    const curve = { p, a4: 1n };
    const weierstrass = { p, a2: 0n, a4: 1n, a6: 0n };
    const F = makeFp2(p);
    const phi = distort(F, P)!;
    const alpha = reducedTate(F, curve, n, P, phi).value;
    const source = seededSource(99);
    for (let i = 0; i < 20; i++) {
      const a = randomScalar(n, source);
      const aP = mul(weierstrass, a, P).point;
      const left = reducedTate(F, curve, n, aP, phi).value;
      expect(F.eq(left, F.pow(alpha, a)), `a = ${a}`).toBe(true);
    }
  });

  it('with Q = φ(P) every intermediate x-coordinate of the Miller chain is F_p-rational, so vertical factors lie in F_p', () => {
    const { p, n, P } = MOV_INSTANCES[0];
    const F = makeFp2(p);
    const phi = distort(F, P)!;
    const { rows } = millerLoop(F, { p, a4: 1n }, n, embed(F, P), phi);
    for (const row of rows) {
      if (row.T !== null) {
        expect(row.T.x.b).toBe(0n);
        expect(row.T.y.b).toBe(0n);
      }
    }
    expect(finalExponent(p, n) % (p - 1n)).toBe(0n);
  });

  it('makeFp2 refuses p ≡ 1 (mod 4), where i² + 1 is reducible', () => {
    expect(() => makeFp2(1009n)).toThrow(/p ≡ 3/);
  });
});
