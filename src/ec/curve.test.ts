import { describe, expect, it } from 'vitest';
import { add, discriminant, formatCurve, isOnCurve, mul, negate, pointsEqual, validateCurve } from './curve';
import { MONNERAT_2002, SMART_1999 } from '../data/published';

describe('curve arithmetic (general Weierstrass, with the x² term Smart needs)', () => {
  it("accepts Smart's published points and 16·P = Q", () => {
    const { curve, P, Q } = SMART_1999;
    expect(isOnCurve(curve, P)).toBe(true);
    expect(isOnCurve(curve, Q)).toBe(true);
    expect(pointsEqual(mul(curve, 16n, P).point, Q)).toBe(true);
    expect(mul(curve, 43n, P).point).toBeNull(); // P has order p = 43
  });

  it("accepts Monnerat's published points and 123·P = Q", () => {
    const { curve, P, Q } = MONNERAT_2002;
    expect(isOnCurve(curve, P)).toBe(true);
    expect(isOnCurve(curve, Q)).toBe(true);
    expect(pointsEqual(mul(curve, 123n, P).point, Q)).toBe(true);
    expect(mul(curve, 1019n, P).point).toBeNull();
  });

  it('negation, the identity and P + (−P) = O', () => {
    const { curve, P } = SMART_1999;
    expect(add(curve, P, null)).toEqual(P);
    expect(add(curve, null, P)).toEqual(P);
    expect(add(curve, P, negate(P, curve.p))).toBeNull();
    expect(pointsEqual(add(curve, P, P), mul(curve, 2n, P).point)).toBe(true);
  });

  it('counts curve operations: k·P costs about log₂k doublings plus the additions', () => {
    const { curve, P } = SMART_1999;
    expect(mul(curve, 1n, P).ops).toBe(0);
    expect(mul(curve, 2n, P).ops).toBe(1);
    expect(mul(curve, 3n, P).ops).toBe(2);
    expect(mul(curve, 42n, P).ops).toBe(5 + 2); // 101010₂: five doublings, two further additions
  });

  it('fails closed on p = 2, p = 3, composite p and singular curves', () => {
    expect(validateCurve(2n, 0n, 1n, 1n)).toMatchObject({ ok: false, reason: 'p-too-small' });
    expect(validateCurve(3n, 0n, 1n, 1n)).toMatchObject({ ok: false, reason: 'p-too-small' });
    expect(validateCurve(1849n, 0n, 1n, 1n)).toMatchObject({ ok: false, reason: 'p-not-prime' });
    // y² = x³ has a cusp: discriminant 0.
    expect(validateCurve(43n, 0n, 0n, 0n)).toMatchObject({ ok: false, reason: 'singular' });
    // y² = x³ − 3x + 2 = (x − 1)²(x + 2) has a node.
    expect(validateCurve(1019n, 0n, -3n, 2n)).toMatchObject({ ok: false, reason: 'singular' });
    expect(validateCurve(43n, 39n, 1n, 41n)).toMatchObject({ ok: true });
  });

  it('the discriminant of the cubic is zero exactly for repeated roots', () => {
    expect(discriminant({ p: 1019n, a2: 0n, a4: -3n, a6: 2n })).toBe(0n);
    expect(discriminant(SMART_1999.curve)).not.toBe(0n);
    expect(discriminant({ p: 1019n, a2: 0n, a4: 1n, a6: 0n })).not.toBe(0n);
  });

  it('formats the equation with only the terms present', () => {
    expect(formatCurve(SMART_1999.curve)).toBe('y² = x³ + 39x² + x + 41');
    expect(formatCurve({ p: 1019n, a2: 0n, a4: 1n, a6: 0n })).toBe('y² = x³ + x');
  });
});
