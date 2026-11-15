/**
 * The INDEPENDENT check: does m·P really equal Q on the original curve?
 *
 * This module imports nothing from src/attack/ and is imported by nothing
 * there, which two tests assert against the source itself. It also
 * deliberately does not reuse
 * src/ec/curve.ts: its scalar multiplication is written out again below, so a
 * defect in the shared arithmetic cannot make the attack and its check agree
 * by construction. A "recovered" verdict anywhere in the page is this function
 * saying `ok: true`, and nothing else.
 */
import type { Curve, Point } from '../ec/curve';

function reduce(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

function inverse(a: bigint, m: bigint): bigint {
  let [r0, r1] = [reduce(a, m), m];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) throw new Error(`${a} is not invertible modulo ${m}`);
  return reduce(s0, m);
}

function addPoints(c: Curve, P: Point, Q: Point): Point {
  if (P === null) return Q;
  if (Q === null) return P;
  const m = c.p;
  let slope: bigint;
  if (P.x === Q.x) {
    if (reduce(P.y + Q.y, m) === 0n) return null;
    slope = reduce((3n * P.x * P.x + 2n * c.a2 * P.x + c.a4) * inverse(2n * P.y, m), m);
  } else {
    slope = reduce((Q.y - P.y) * inverse(Q.x - P.x, m), m);
  }
  const x = reduce(slope * slope - c.a2 - P.x - Q.x, m);
  const y = reduce(slope * (P.x - x) - P.y, m);
  return { x, y };
}

/** k·P by a right-to-left binary ladder — a different shape from curve.ts's left-to-right loop. */
export function independentScalarMultiply(c: Curve, k: bigint, P: Point): Point {
  if (k < 0n) throw new RangeError('scalar must be non-negative');
  let result: Point = null;
  let addend: Point = P;
  while (k > 0n) {
    if (k & 1n) result = addPoints(c, result, addend);
    addend = addPoints(c, addend, addend);
    k >>= 1n;
  }
  return result;
}

export interface Verification {
  readonly ok: boolean;
  /** m·P as this module computed it. */
  readonly computed: Point;
  readonly expected: Point;
}

/** Decides a candidate logarithm: ok exactly when m·P and Q are the same point, both coordinates. */
export function verifyLogarithm(c: Curve, P: Point, Q: Point, m: bigint): Verification {
  const computed = independentScalarMultiply(c, m, P);
  let ok: boolean;
  if (computed === null || Q === null) ok = computed === Q;
  else ok = computed.x === Q.x && computed.y === Q.y;
  return { ok, computed, expected: Q };
}
