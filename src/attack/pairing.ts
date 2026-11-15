/**
 * Miller's algorithm and the reduced Tate pairing on E: y² = x³ + a4·x over
 * F_p, p ≡ 3 (mod 4), evaluated at points of E(F_{p²}).
 *
 * What is computed, precisely:
 *
 *   t(P, Q) = f_{n,P}(Q) ^ ((p² − 1) / n)
 *
 * where f_{n,P} is the Miller function with divisor n(P) − n(O), built
 * incrementally from the lines of the double-and-add chain for n·P, and Q is
 * the image of a point of E(F_p) under the distortion map φ(x, y) = (−x, i·y).
 * This is the REDUCED TATE PAIRING WITH A DISTORTION MAP, not the Weil pairing
 * of the 1991 paper; the page says so. Both are bilinear, both are
 * non-degenerate on the pairs used here, and the transfer of the logarithm is
 * identical.
 *
 * Vertical-line factors are kept in the Miller loop so `f` is the genuine
 * function value. With Q = φ(P) every vertical factor lies in F_p (both x's
 * are F_p-rational), and the final exponent (p² − 1)/n is a multiple of p − 1,
 * so the final exponentiation kills them; the tests check the F_p claim.
 */
import type { Point } from '../ec/curve';
import type { Fp2, Fp2Field } from '../ec/fp2';

/** y² = x³ + a4·x over F_p; a2 = a6 = 0 is what makes the distortion map work. */
export interface PairingCurve {
  readonly p: bigint;
  readonly a4: bigint;
}

export interface Fp2Affine {
  readonly x: Fp2;
  readonly y: Fp2;
}

export type Fp2Point = Fp2Affine | null;

export function embed(F: Fp2Field, P: Point): Fp2Point {
  return P === null ? null : { x: F.el(P.x, 0n), y: F.el(P.y, 0n) };
}

// [extension] point — the pairing interface. A Weil-pairing variant would
// replace `distort` with an independent n-torsion point from E(F_{p²}) and
// `reducedTate` with the quotient of two Miller functions; everything above
// this layer (mov.ts, the panel) consumes only (α, β).
/** φ(x, y) = (−x, i·y): maps E(F_p) into E(F_{p²}) off the F_p-rational subgroup. */
export function distort(F: Fp2Field, P: Point): Fp2Point {
  if (P === null) return null;
  return { x: F.el(-P.x, 0n), y: F.el(0n, P.y) };
}

export function isOnCurveFp2(F: Fp2Field, c: PairingCurve, P: Fp2Point): boolean {
  if (P === null) return true;
  const lhs = F.sqr(P.y);
  const rhs = F.add(F.mul(F.sqr(P.x), P.x), F.mul(F.el(c.a4, 0n), P.x));
  return F.eq(lhs, rhs);
}

export function addFp2(F: Fp2Field, c: PairingCurve, P: Fp2Point, Q: Fp2Point): Fp2Point {
  if (P === null) return Q;
  if (Q === null) return P;
  let lambda: Fp2;
  if (F.eq(P.x, Q.x)) {
    if (F.isZero(F.add(P.y, Q.y))) return null;
    lambda = F.mul(F.add(F.mul(F.el(3n, 0n), F.sqr(P.x)), F.el(c.a4, 0n)), F.inv(F.mul(F.el(2n, 0n), P.y)));
  } else {
    lambda = F.mul(F.sub(Q.y, P.y), F.inv(F.sub(Q.x, P.x)));
  }
  const x3 = F.sub(F.sub(F.sqr(lambda), P.x), Q.x);
  const y3 = F.sub(F.mul(lambda, F.sub(P.x, x3)), P.y);
  return { x: x3, y: y3 };
}

export function mulFp2(F: Fp2Field, c: PairingCurve, k: bigint, P: Fp2Point): Fp2Point {
  let result: Fp2Point = null;
  for (const bit of k.toString(2)) {
    result = addFp2(F, c, result, result);
    if (bit === '1') result = addFp2(F, c, result, P);
  }
  return result;
}

export interface MillerRow {
  readonly index: number;
  readonly kind: 'double' | 'add';
  /** The accumulated f after this step. */
  readonly f: Fp2;
  /** The running multiple T of P after this step. */
  readonly T: Fp2Point;
}

/**
 * The function (l_{T,S} / v_{T+S}) evaluated at Q, where l is the line through
 * T and S (the tangent when T = S) and v the vertical through T + S. The two
 * degenerate shapes — a point at infinity, or S = −T so the line is vertical
 * and the sum is O — evaluate without any division.
 */
function lineOverVertical(F: Fp2Field, c: PairingCurve, T: Fp2Point, S: Fp2Point, Q: Fp2Affine): Fp2 {
  if (T === null || S === null) return F.one;
  if (F.eq(T.x, S.x) && F.isZero(F.add(T.y, S.y))) {
    // Vertical line x − x_T; T + S = O so there is no vertical to divide by.
    return F.sub(Q.x, T.x);
  }
  let lambda: Fp2;
  if (F.eq(T.x, S.x)) {
    lambda = F.mul(F.add(F.mul(F.el(3n, 0n), F.sqr(T.x)), F.el(c.a4, 0n)), F.inv(F.mul(F.el(2n, 0n), T.y)));
  } else {
    lambda = F.mul(F.sub(S.y, T.y), F.inv(F.sub(S.x, T.x)));
  }
  const line = F.sub(F.sub(Q.y, T.y), F.mul(lambda, F.sub(Q.x, T.x)));
  const x3 = F.sub(F.sub(F.sqr(lambda), T.x), S.x);
  const vertical = F.sub(Q.x, x3);
  return F.mul(line, F.inv(vertical));
}

/** f_{n,P}(Q) by Miller's algorithm, with every intermediate value kept for display. */
export function millerLoop(
  F: Fp2Field,
  c: PairingCurve,
  n: bigint,
  P: Fp2Point,
  Q: Fp2Affine,
): { readonly f: Fp2; readonly rows: MillerRow[] } {
  if (n < 1n) throw new RangeError('n must be positive');
  const rows: MillerRow[] = [];
  let f = F.one;
  let T: Fp2Point = P;
  const bits = n.toString(2);
  for (let i = 1; i < bits.length; i++) {
    f = F.mul(F.sqr(f), lineOverVertical(F, c, T, T, Q));
    T = addFp2(F, c, T, T);
    rows.push({ index: rows.length + 1, kind: 'double', f, T });
    if (bits[i] === '1') {
      f = F.mul(f, lineOverVertical(F, c, T, P, Q));
      T = addFp2(F, c, T, P);
      rows.push({ index: rows.length + 1, kind: 'add', f, T });
    }
  }
  return { f, rows };
}

/** (p² − 1) / n — requires n | p² − 1, which n | p + 1 guarantees. */
export function finalExponent(p: bigint, n: bigint): bigint {
  const order = p * p - 1n;
  if (order % n !== 0n) throw new RangeError(`n = ${n} does not divide p² − 1`);
  return order / n;
}

export interface TateResult {
  readonly miller: { readonly f: Fp2; readonly rows: MillerRow[] };
  readonly exponent: bigint;
  /** f_{n,P}(Q) ^ ((p² − 1)/n): an n-th root of unity in F_{p²}. */
  readonly value: Fp2;
}

/** The reduced Tate pairing t(P, Q) for P ∈ E(F_p)[n] and Q ∈ E(F_{p²}). */
export function reducedTate(F: Fp2Field, c: PairingCurve, n: bigint, P: Point, Q: Fp2Affine): TateResult {
  const miller = millerLoop(F, c, n, embed(F, P), Q);
  const exponent = finalExponent(c.p, n);
  const value = F.pow(miller.f, exponent);
  return { miller, exponent, value };
}
