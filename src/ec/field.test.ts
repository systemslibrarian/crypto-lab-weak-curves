import { describe, expect, it } from 'vitest';
import {
  factorise,
  formatFactorisation,
  isProbablePrime,
  isqrt,
  isqrtCeil,
  legendre,
  modInv,
  modPow,
  NonInvertibleError,
  sqrtMod,
} from './field';

describe('field arithmetic', () => {
  it('modInv inverts units and refuses non-units with a typed error', () => {
    expect((modInv(19n, 43n) * 19n) % 43n).toBe(1n);
    expect(modInv(2n * 16n, 43n)).toBe(modInv(32n, 43n));
    // 43 is not a unit modulo 43² = 1849: this is the division Smart's attack must avoid.
    expect(() => modInv(43n, 1849n)).toThrow(NonInvertibleError);
    expect(() => modInv(86n, 1849n)).toThrow(/no inverse/);
  });

  it('modPow matches repeated multiplication', () => {
    expect(modPow(2n, 10n, 1000n)).toBe(24n);
    expect(modPow(3n, 0n, 7n)).toBe(1n);
    expect(modPow(43n, 2n, 49871n)).toBe((43n * 43n) % 49871n);
  });

  it('isProbablePrime agrees on every prime and composite this lab relies on', () => {
    for (const prime of [43n, 1019n, 199483n, 49871n, 54288523n, 13572131n, 72626871211n, 2593816829n]) {
      expect(isProbablePrime(prime), `${prime} is prime`).toBe(true);
    }
    for (const composite of [1n, 4n, 1020n, 199484n, 1849n, 561n, 1105n]) {
      expect(isProbablePrime(composite), `${composite} is composite`).toBe(false);
    }
    expect(isProbablePrime(2n)).toBe(true);
    expect(isProbablePrime(3n)).toBe(true);
  });

  it('sqrtMod returns a square root for residues and null for non-residues, in both p mod 4 classes', () => {
    for (const p of [43n, 1019n, 1009n, 17n, 13n]) {
      let residues = 0;
      for (let a = 1n; a < p; a++) {
        const r = sqrtMod(a, p);
        if (legendre(a, p) === 1) {
          residues += 1;
          expect(r, `sqrt of ${a} mod ${p}`).not.toBeNull();
          expect((r! * r!) % p).toBe(a);
        } else {
          expect(r).toBeNull();
        }
      }
      expect(BigInt(residues)).toBe((p - 1n) / 2n);
    }
  });

  it('factorise gives prime powers and formats them', () => {
    expect(factorise(1020n)).toEqual([
      { prime: 2n, exponent: 2 },
      { prime: 3n, exponent: 1 },
      { prime: 5n, exponent: 1 },
      { prime: 17n, exponent: 1 },
    ]);
    expect(formatFactorisation(factorise(1020n))).toBe('2^2 · 3 · 5 · 17');
    expect(factorise(43n)).toEqual([{ prime: 43n, exponent: 1 }]);
    expect(factorise(199484n).map((f) => f.prime)).toContain(49871n);
    expect(() => factorise(1n << 65n)).toThrow(/2\^64/);
  });

  it('integer square roots are exact', () => {
    expect(isqrt(49870n)).toBe(223n);
    expect(isqrtCeil(49871n)).toBe(224n);
    expect(isqrtCeil(2593816829n)).toBe(50930n);
    expect(isqrtCeil(49n)).toBe(7n);
  });
});
