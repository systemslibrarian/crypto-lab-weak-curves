/**
 * Counting points by enumeration, orders of points, and the embedding degree.
 *
 * The `PointCount` this produces is the CERTIFICATE Smart's attack demands:
 * the attack refuses unless a count from THIS module, for THAT curve, says it
 * has exactly p points. Nothing else manufactures one, so a precondition can
 * never be assumed into existence by the code that benefits from it.
 */
import type { Curve, Point } from './curve';
import { add, mul } from './curve';
import { factorise, legendre, modPow, type PrimePower } from './field';

/** Enumeration is O(p) Legendre symbols; above this it is refused, not attempted. */
export const ENUMERATION_CAP = 20_000n;

export interface PointCount {
  readonly kind: 'point-count';
  readonly curve: Curve;
  /** #E(F_p), including the point at infinity. */
  readonly order: bigint;
  /** The trace of Frobenius t = p + 1 − #E. */
  readonly trace: bigint;
}

export type CountResult =
  | { readonly ok: true; readonly count: PointCount }
  | { readonly ok: false; readonly reason: 'p-above-cap'; readonly detail: string };

/**
 * The non-zero quadratic residues modulo p as a lookup table, built once per p
 * from the squares themselves (BigInt, exact) and reused across the curves
 * exhibit 3 tries over the same field. It turns a Legendre symbol per x into
 * one lookup per x; the count is the same sum either way.
 */
const residueCache = new Map<bigint, Uint8Array>();

export function residueTable(p: bigint): Uint8Array {
  const cached = residueCache.get(p);
  if (cached) return cached;
  const table = new Uint8Array(Number(p));
  for (let x = 1n; x < p; x++) table[Number((x * x) % p)] = 1;
  if (residueCache.size > 4) residueCache.clear();
  residueCache.set(p, table);
  return table;
}

/**
 * #E = 1 + Σ_x (1 + χ(f(x))): one point at infinity, then for each x either no
 * point (f a non-residue), one point (f = 0) or two points (f a residue).
 */
export function countPoints(curve: Curve): CountResult {
  const { p } = curve;
  if (p > ENUMERATION_CAP) {
    return {
      ok: false,
      reason: 'p-above-cap',
      detail: `p = ${p} is above the enumeration cap of ${ENUMERATION_CAP}: counting by enumeration costs p residue tests, and point counting at this size needs Schoof's algorithm, which is out of scope`,
    };
  }
  const squares = residueTable(p);
  let order = 1n; // the point at infinity
  for (let x = 0n; x < p; x++) {
    const f = (x * x * x + curve.a2 * x * x + curve.a4 * x + curve.a6) % p;
    if (f === 0n) order += 1n;
    else if (squares[Number(f)] === 1) order += 2n;
  }
  return {
    ok: true,
    count: { kind: 'point-count', curve, order, trace: p + 1n - order },
  };
}

export type CurveClass = 'anomalous' | 'supersingular' | 'neither';

/** From the computed numbers alone: t = 1 is anomalous; t = 0 (p ≥ 5) is supersingular. */
export function classify(count: PointCount): CurveClass {
  if (count.trace === 1n) return 'anomalous';
  if (count.trace === 0n) return 'supersingular';
  return 'neither';
}

export function largestPrimeFactor(factors: readonly PrimePower[]): bigint {
  return factors.reduce((best, f) => (f.prime > best ? f.prime : best), 1n);
}

export function factorOrder(count: PointCount): PrimePower[] {
  return factorise(count.order);
}

export type EmbeddingDegree =
  | { readonly found: true; readonly k: number }
  | { readonly found: false; readonly bound: number };

/**
 * The smallest k with p^k ≡ 1 (mod n), searched up to and including `bound`.
 * Past the bound the honest answer is "greater than the bound", never a number.
 */
export function embeddingDegree(p: bigint, n: bigint, bound: number): EmbeddingDegree {
  if (n <= 1n) throw new RangeError('n must exceed 1');
  if (bound < 1) throw new RangeError('the bound must be at least 1');
  let power = 1n;
  const base = p % n;
  for (let k = 1; k <= bound; k++) {
    power = (power * base) % n;
    if (power === 1n) return { found: true, k };
  }
  return { found: false, bound };
}

/** Same search, written as a list of (k, p^k mod n) rows so the page can show its work. */
export function embeddingDegreeRows(p: bigint, n: bigint, bound: number): { k: number; residue: bigint }[] {
  const rows: { k: number; residue: bigint }[] = [];
  let power = 1n;
  const base = p % n;
  for (let k = 1; k <= bound; k++) {
    power = (power * base) % n;
    rows.push({ k, residue: power });
    if (power === 1n) break;
  }
  return rows;
}

/**
 * The order of P, given the group order and its factorisation (Lagrange: the
 * order divides #E; strip each prime while the multiple stays O).
 */
export function orderOfPoint(curve: Curve, P: Point, groupOrder: bigint, factors: readonly PrimePower[]): bigint {
  if (P === null) return 1n;
  let order = groupOrder;
  for (const { prime } of factors) {
    while (order % prime === 0n && mul(curve, order / prime, P).point === null) order /= prime;
  }
  return order;
}

/** Every affine point, in x order — only used for toy displays; respects the cap. */
export function listPoints(curve: Curve, limit = 64): Point[] {
  const out: Point[] = [];
  for (let x = 0n; x < curve.p && out.length < limit; x++) {
    const f = (x * x * x + curve.a2 * x * x + curve.a4 * x + curve.a6) % curve.p;
    if (f === 0n) out.push({ x, y: 0n });
    else if (legendre(f, curve.p) === 1) {
      const y = modPow(f, (curve.p + 1n) >> 2n, curve.p);
      if (curve.p % 4n === 3n) {
        out.push({ x, y }, { x, y: curve.p - y });
      }
    }
  }
  return out;
}

export { add };
