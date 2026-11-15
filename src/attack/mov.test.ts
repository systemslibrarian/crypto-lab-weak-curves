import { describe, expect, it } from 'vitest';
import { checkMovPreconditions, movAttack } from './mov';
import { verifyLogarithm } from '../check/verify';
import { MOV_INSTANCES, TWO_TORSION_POINT } from '../data/published';

describe('the MOV reduction end to end', () => {
  for (const { bits, p, n, P, R, secret } of MOV_INSTANCES) {
    it(`recovers l on the ${bits}-bit instance and the independent verifier confirms l·P = R`, () => {
      const result = movAttack({ curve: { p, a4: 1n }, n, P, R });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.candidate).toBe(secret);
      expect(verifyLogarithm({ p, a2: 0n, a4: 1n, a6: 0n }, P, R, result.candidate!).ok).toBe(true);
      expect(result.trace.search.babySteps).toBe(Number(result.trace.search.m));
      expect(result.trace.search.giantSteps).toBeLessThan(Number(result.trace.search.m));
    });
  }
});

describe('the MOV exhibit fails closed', () => {
  const { p, n, P, R } = MOV_INSTANCES[0];
  const curve = { p, a4: 1n };

  it('refuses n that is not prime', () => {
    expect(checkMovPreconditions({ curve, n: 4n, P, R })).toMatch(/not prime/);
  });

  it('refuses n that does not divide p + 1', () => {
    expect(checkMovPreconditions({ curve, n: 49877n, P, R })).toMatch(/does not divide p \+ 1/);
  });

  it('refuses p ≢ 3 (mod 4)', () => {
    expect(checkMovPreconditions({ curve: { p: 1009n, a4: 1n }, n: 101n, P, R })).toMatch(/p ≡ 3 \(mod 4\)/);
  });

  it('refuses composite p', () => {
    expect(checkMovPreconditions({ curve: { p: 199487n * 1n + 0n, a4: 1n }, n, P, R })).toMatch(/not prime|does not divide|not on the curve|p ≡/);
    expect(checkMovPreconditions({ curve: { p: 1849n, a4: 1n }, n: 5n, P, R })).toMatch(/not prime/);
  });

  it('refuses P = O, P off the curve, and P without order n', () => {
    expect(checkMovPreconditions({ curve, n, P: null, R })).toMatch(/point at infinity/);
    expect(checkMovPreconditions({ curve, n, P: { x: 1n, y: 1n }, R })).toMatch(/not on the curve/);
    expect(checkMovPreconditions({ curve, n, P: TWO_TORSION_POINT, R })).toMatch(/does not have order n/);
  });

  it('refuses R = O (l = 0 by definition) and R off the curve', () => {
    expect(checkMovPreconditions({ curve, n, P, R: null })).toMatch(/logarithm is 0/);
    expect(checkMovPreconditions({ curve, n, P, R: { x: 2n, y: 2n } })).toMatch(/not on the curve/);
  });

  it('R outside the order-n subgroup: whatever the field search returns fails verification — "no logarithm exists", never a wrong number', () => {
    const result = movAttack({ curve, n, P, R: TWO_TORSION_POINT });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const weierstrass = { p, a2: 0n, a4: 1n, a6: 0n };
    if (result.candidate !== null) {
      expect(verifyLogarithm(weierstrass, P, TWO_TORSION_POINT, result.candidate).ok).toBe(false);
    }
    // And no l in [0, n) can work: the 2-torsion point is not a multiple of a point of odd order n.
    expect(verifyLogarithm(weierstrass, P, TWO_TORSION_POINT, 0n).ok).toBe(false);
  });

  it('l = 1 (R = P) is recovered as 1', () => {
    const result = movAttack({ curve, n, P, R: P });
    expect(result.ok && result.candidate).toBe(1n);
  });
});
