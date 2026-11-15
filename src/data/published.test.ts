import { describe, expect, it } from 'vitest';
import { isOnCurve, mul } from '../ec/curve';
import { isProbablePrime } from '../ec/field';
import { MONNERAT_2002, MOV_INSTANCES, NAMED_CURVES, P256, SECP256K1, SMART_1999 } from './published';

describe('named-curve parameters copied from their specifications', () => {
  for (const named of NAMED_CURVES) {
    it(`${named.name}: p and n are prime, G is on the curve, n·G = O, and h = 1`, () => {
      expect(isProbablePrime(named.curve.p)).toBe(true);
      expect(isProbablePrime(named.n)).toBe(true);
      expect(isOnCurve(named.curve, named.G)).toBe(true);
      expect(mul(named.curve, named.n, named.G).point).toBeNull();
      expect(named.h).toBe(1n);
      expect(named.n).not.toBe(named.curve.p);
    });
  }

  it('P-256 has a = p − 3 (SP 800-186 writes a = −3) and secp256k1 has a = 0, b = 7', () => {
    expect(P256.curve.a4).toBe(P256.curve.p - 3n);
    expect(SECP256K1.curve.a4).toBe(0n);
    expect(SECP256K1.curve.a6).toBe(7n);
    expect(SECP256K1.curve.p).toBe((1n << 256n) - (1n << 32n) - 977n);
  });

  it('attributions name the documents that were read, and cannot drift silently', () => {
    expect(SMART_1999.source).toBe('N. P. Smart, J. Cryptology 12(3) (1999) 193–196, worked example');
    expect(MONNERAT_2002.source).toBe('J. Monnerat, EPFL technical report IC/2002/49 (2002), worked example');
    expect(P256.source).toBe('NIST SP 800-186 (Feb 2023) §3.2.1.3');
    expect(SECP256K1.source).toBe('SEC 2 v2.0 (Jan 2010) §2.4.1');
  });

  it('the published inputs are on their curves', () => {
    for (const example of [SMART_1999, MONNERAT_2002]) {
      expect(isOnCurve(example.curve, example.P)).toBe(true);
      expect(isOnCurve(example.curve, example.Q)).toBe(true);
    }
    for (const { p, P, R } of MOV_INSTANCES) {
      const curve = { p, a2: 0n, a4: 1n, a6: 0n };
      expect(isOnCurve(curve, P)).toBe(true);
      expect(isOnCurve(curve, R)).toBe(true);
    }
  });
});
