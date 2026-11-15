import { describe, expect, it } from 'vitest';
import {
  classify,
  countPoints,
  embeddingDegree,
  embeddingDegreeRows,
  ENUMERATION_CAP,
  factorOrder,
  largestPrimeFactor,
  orderOfPoint,
} from './count';
import { MONNERAT_2002, MOV_INSTANCES, SMART_1999 } from '../data/published';

describe('point counting by enumeration', () => {
  it("Smart's curve over F_43 has exactly 43 points, including the point at infinity", () => {
    const result = countPoints(SMART_1999.curve);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count.order).toBe(43n);
    expect(result.count.trace).toBe(1n);
    expect(classify(result.count)).toBe('anomalous');
  });

  it("Monnerat's curve over F_1019 has exactly 1019 points", () => {
    const result = countPoints(MONNERAT_2002.curve);
    expect(result.ok && result.count.order).toBe(1019n);
    expect(result.ok && classify(result.count)).toBe('anomalous');
  });

  it('y² = x³ + x over F_1019 (p ≡ 3 mod 4) has p + 1 = 1020 points and is supersingular', () => {
    const result = countPoints({ p: 1019n, a2: 0n, a4: 1n, a6: 0n });
    expect(result.ok && result.count.order).toBe(1020n);
    expect(result.ok && result.count.trace).toBe(0n);
    expect(result.ok && classify(result.count)).toBe('supersingular');
    expect(result.ok && largestPrimeFactor(factorOrder(result.count))).toBe(17n);
  });

  it('a curve that is neither: Smart\'s curve with a6 = 40 has 48 points', () => {
    const result = countPoints({ p: 43n, a2: 39n, a4: 1n, a6: 40n });
    expect(result.ok && result.count.order).toBe(48n);
    expect(result.ok && classify(result.count)).toBe('neither');
  });

  it('agrees with Hasse: |t| ≤ 2√p on fifty curves over F_1009 (p ≡ 1 mod 4)', () => {
    for (let a6 = 1n; a6 <= 50n; a6++) {
      const result = countPoints({ p: 1009n, a2: 0n, a4: 7n, a6 });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const t = result.count.trace < 0n ? -result.count.trace : result.count.trace;
      expect(t * t <= 4n * 1009n).toBe(true);
    }
  });

  it('refuses p above the enumeration cap with the reason, never a number', () => {
    const result = countPoints({ p: ENUMERATION_CAP + 1n, a2: 0n, a4: 1n, a6: 0n });
    expect(result).toMatchObject({ ok: false, reason: 'p-above-cap' });
    expect(!result.ok && result.detail).toMatch(/enumeration cap/);
  });
});

describe('embedding degree', () => {
  it('is 2 for the order-17 subgroup of y² = x³ + x over F_1019 and for every MOV instance', () => {
    expect(embeddingDegree(1019n, 17n, 20)).toEqual({ found: true, k: 2 });
    for (const { p, n } of MOV_INSTANCES) {
      expect(embeddingDegree(p, n, 20)).toEqual({ found: true, k: 2 });
      expect(embeddingDegreeRows(p, n, 20)).toEqual([
        { k: 1, residue: p % n },
        { k: 2, residue: 1n },
      ]);
    }
  });

  it('reports "greater than the bound" rather than a number when nothing up to B works', () => {
    // n = 43 and p = 43: p ≡ 0 mod n so no power is 1 — the anomalous case has no embedding degree at all.
    expect(embeddingDegree(43n, 43n, 50)).toEqual({ found: false, bound: 50 });
    // 48 points, largest prime 3: 43 ≡ 1 mod 3 so k = 1.
    expect(embeddingDegree(43n, 3n, 50)).toEqual({ found: true, k: 1 });
    expect(embeddingDegree(1019n, 1013n, 10)).toEqual({ found: false, bound: 10 });
  });

  it('orderOfPoint divides the group order and is exact', () => {
    const curve = { p: 1019n, a2: 0n, a4: 1n, a6: 0n };
    const count = countPoints(curve);
    if (!count.ok) throw new Error('count refused');
    const factors = factorOrder(count.count);
    // (0, 0) has order 2 on every y² = x³ + x.
    expect(orderOfPoint(curve, { x: 0n, y: 0n }, 1020n, factors)).toBe(2n);
    expect(orderOfPoint(curve, null, 1020n, factors)).toBe(1n);
    expect(orderOfPoint(SMART_1999.curve, SMART_1999.P, 43n, [{ prime: 43n, exponent: 1 }])).toBe(43n);
  });
});
