/**
 * Affine arithmetic on the Weierstrass curve
 *
 *     y² = x³ + a2·x² + a4·x + a6
 *
 * over Z/m. The modulus is a parameter rather than a property of the curve
 * because Smart's attack runs the SAME equation modulo p², where Z/p² is a
 * ring, not a field: an inversion there can fail, and when it does the
 * `NonInvertibleError` from field.ts is allowed to propagate so the caller
 * reports it rather than printing a wrong number.
 *
 * Smart's own example uses a2 = 39, so the x² term is carried everywhere.
 *
 * Every operation that combines two points counts as one "curve operation" in
 * the `ops` tallies the page prints; the attack and the square-root estimate
 * are compared in that unit.
 */
import { isProbablePrime, mod, modInv } from './field';

export interface Curve {
  readonly p: bigint;
  readonly a2: bigint;
  readonly a4: bigint;
  readonly a6: bigint;
}

export interface AffinePoint {
  readonly x: bigint;
  readonly y: bigint;
}

/** `null` is the point at infinity. */
export type Point = AffinePoint | null;

export const INFINITY: Point = null;

export function pointsEqual(P: Point, Q: Point): boolean {
  if (P === null || Q === null) return P === Q;
  return P.x === Q.x && P.y === Q.y;
}

export function curvesEqual(a: Curve, b: Curve): boolean {
  return a.p === b.p && a.a2 === b.a2 && a.a4 === b.a4 && a.a6 === b.a6;
}

/** The right-hand side f(x) = x³ + a2x² + a4x + a6, reduced modulo m. */
export function rhs(c: Curve, x: bigint, m: bigint = c.p): bigint {
  return mod(x * x * x + c.a2 * x * x + c.a4 * x + c.a6, m);
}

/** f(x) over the INTEGERS — the lift in Smart's attack needs the unreduced value. */
export function rhsInteger(c: Curve, x: bigint): bigint {
  return x * x * x + c.a2 * x * x + c.a4 * x + c.a6;
}

export function isOnCurve(c: Curve, P: Point, m: bigint = c.p): boolean {
  if (P === null) return true;
  if (P.x < 0n || P.x >= m || P.y < 0n || P.y >= m) return false;
  return mod(P.y * P.y, m) === rhs(c, P.x, m);
}

/**
 * Discriminant of the cubic x³ + a2x² + a4x + a6, modulo p. The curve is
 * non-singular exactly when this is non-zero (for p ≥ 5 the factor −16 in the
 * curve discriminant is a unit and changes nothing).
 */
export function discriminant(c: Curve): bigint {
  const { a2, a4, a6 } = c;
  return mod(
    a2 * a2 * a4 * a4 - 4n * a4 * a4 * a4 - 4n * a2 * a2 * a2 * a6 - 27n * a6 * a6 + 18n * a2 * a4 * a6,
    c.p,
  );
}

export function negate(P: Point, m: bigint): Point {
  if (P === null) return null;
  return { x: P.x, y: mod(-P.y, m) };
}

export function add(c: Curve, P: Point, Q: Point, m: bigint = c.p): Point {
  if (P === null) return Q;
  if (Q === null) return P;
  let lambda: bigint;
  if (mod(P.x - Q.x, m) === 0n) {
    if (mod(P.y + Q.y, m) === 0n) return null;
    lambda = mod((3n * P.x * P.x + 2n * c.a2 * P.x + c.a4) * modInv(2n * P.y, m), m);
  } else {
    lambda = mod((Q.y - P.y) * modInv(Q.x - P.x, m), m);
  }
  const x3 = mod(lambda * lambda - c.a2 - P.x - Q.x, m);
  const y3 = mod(lambda * (P.x - x3) - P.y, m);
  return { x: x3, y: y3 };
}

export function double(c: Curve, P: Point, m: bigint = c.p): Point {
  return add(c, P, P, m);
}

export interface ScalarResult {
  readonly point: Point;
  /** Point additions and doublings performed, each counted once. */
  readonly ops: number;
}

/** k·P by left-to-right double-and-add, counting every curve operation. */
export function mul(c: Curve, k: bigint, P: Point, m: bigint = c.p): ScalarResult {
  if (k < 0n) throw new RangeError('scalar must be non-negative');
  let result: Point = null;
  let ops = 0;
  for (const bit of k.toString(2)) {
    if (result !== null) {
      result = double(c, result, m);
      ops += 1;
    }
    if (bit === '1') {
      if (result !== null) ops += 1;
      result = add(c, result, P, m);
    }
  }
  return { point: result, ops };
}

export type CurveValidation =
  | { readonly ok: true; readonly curve: Curve }
  | { readonly ok: false; readonly reason: 'p-too-small' | 'p-not-prime' | 'singular'; readonly detail: string };

/**
 * Fail-closed construction of a curve: p must be a prime ≥ 5 and the cubic
 * must have no repeated root. Coefficients are reduced modulo p.
 */
export function validateCurve(p: bigint, a2: bigint, a4: bigint, a6: bigint): CurveValidation {
  if (p < 5n) {
    return {
      ok: false,
      reason: 'p-too-small',
      detail: `p = ${p}: the lab needs an odd prime p ≥ 5 (characteristic 2 and 3 use different equations and are out of scope)`,
    };
  }
  if (!isProbablePrime(p)) {
    return { ok: false, reason: 'p-not-prime', detail: `p = ${p} is not prime, so Z/p is not a field` };
  }
  const curve: Curve = { p, a2: mod(a2, p), a4: mod(a4, p), a6: mod(a6, p) };
  if (discriminant(curve) === 0n) {
    return {
      ok: false,
      reason: 'singular',
      detail: `the cubic x³ + ${curve.a2}x² + ${curve.a4}x + ${curve.a6} has a repeated root mod ${p}: the curve is singular and its points do not form the group the attacks assume`,
    };
  }
  return { ok: true, curve };
}

export function formatPoint(P: Point): string {
  return P === null ? 'O (point at infinity)' : `(${P.x}, ${P.y})`;
}

export function formatCurve(c: Curve): string {
  const terms: string[] = ['x³'];
  if (c.a2 !== 0n) terms.push(`${c.a2}x²`);
  if (c.a4 !== 0n) terms.push(c.a4 === 1n ? 'x' : `${c.a4}x`);
  if (c.a6 !== 0n) terms.push(`${c.a6}`);
  return `y² = ${terms.join(' + ')}`;
}
