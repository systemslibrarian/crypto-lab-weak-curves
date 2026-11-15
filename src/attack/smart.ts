/**
 * Smart's attack on an anomalous curve (#E(F_p) = p), after
 * N. P. Smart, J. Cryptology 12 (1999) 193–196, in the form Monnerat's
 * tutorial (EPFL IC/2002/49) presents it.
 *
 * The attacker receives (curve, P, Q) plus the point-count CERTIFICATE from
 * src/ec/count.ts and NOTHING ELSE — in particular, never the secret. It
 * returns a CANDIDATE m and never a verdict: src/check/verify.ts decides
 * whether m·P = Q. And it refuses outright unless the certificate establishes
 * #E = p, rather than assuming the curve it was handed is anomalous.
 *
 * The idea, in the units the page shows:
 *   1. LIFT.  Keep x, change y to y' = y + t·p so that (x, y') satisfies the
 *      same equation modulo p². The digit t = ((f(x) − y²)/p)·(2y)⁻¹ mod p is
 *      one Hensel step; it needs 2y invertible, which is why y = 0 is refused.
 *   2. MULTIPLY BY p modulo p².  p·P' reduces to O modulo p, so it lies in the
 *      formal group, where the map ψ(S) = −x(S)/y(S) is a homomorphism to the
 *      additive group pZ/p²Z. Affine formulas cannot take the last step
 *      (they divide by x₂ − x₁, a multiple of p), so A = (p − 1)·P' is computed
 *      affinely and ψ(p·P') is read from the slope of the line through A and
 *      P': ψ(p·P')/p ≡ ((x₂ − x₁)/p)·(y₂ − y₁)⁻¹ (mod p).
 *   3. DIVIDE.  ψ is linear, so ψ(p·Q') = m·ψ(p·P') and m = ψ(p·Q')/ψ(p·P').
 *
 * Cost: two scalar multiplications by p − 1 modulo p² — O(log p) curve
 * operations, counted and printed — against the ~2√p a generic method needs.
 */
import type { PointCount } from '../ec/count';
import { curvesEqual, isOnCurve, mul, rhsInteger, type AffinePoint, type Curve, type Point } from '../ec/curve';
import { mod, modInv, NonInvertibleError } from '../ec/field';
import { sqrtMethodOps } from './bsgs';

export interface Lift {
  /** The Hensel digit t. */
  readonly digit: bigint;
  /** (x, y + t·p), a point on the same equation modulo p². */
  readonly lifted: AffinePoint;
  /** y'² ≡ f(x) (mod p²), recomputed. */
  readonly satisfiesCurveModP2: boolean;
}

export interface PsiStep {
  /** A = (p − 1)·P' computed affinely modulo p². */
  readonly A: AffinePoint;
  /** Curve operations spent on that multiplication. */
  readonly ops: number;
  /** (x₂ − x₁)/p, an integer because A ≡ −P' (mod p). */
  readonly xDiffOverP: bigint;
  /** y₂ − y₁ mod p, a unit because it is 2y mod p. */
  readonly yDiff: bigint;
  /** ψ(p·P')/p mod p. */
  readonly psiOverP: bigint;
}

export interface SmartTrace {
  readonly p: bigint;
  readonly p2: bigint;
  readonly liftP: Lift;
  readonly liftQ: Lift;
  readonly psiP: PsiStep;
  readonly psiQ: PsiStep;
  readonly candidate: bigint;
  /** Total curve operations the attack performed. */
  readonly ops: number;
  /** 2⌈√p⌉: the generic square-root count for a group of order p. */
  readonly sqrtOps: bigint;
}

export type SmartResult =
  | { readonly ok: false; readonly kind: 'refused' | 'failed'; readonly reason: string }
  | { readonly ok: true; readonly trace: SmartTrace; readonly candidate: bigint };

export function liftPoint(curve: Curve, P: AffinePoint): Lift {
  const { p } = curve;
  const p2 = p * p;
  // f(x) − y² over the integers is divisible by p because P is on the curve mod p.
  const defect = rhsInteger(curve, P.x) - P.y * P.y;
  if (mod(defect, p) !== 0n) throw new Error('liftPoint called with a point that is not on the curve');
  const digit = mod((defect / p) * modInv(2n * P.y, p), p);
  const lifted = { x: P.x, y: mod(P.y + digit * p, p2) };
  const satisfiesCurveModP2 = mod(lifted.y * lifted.y, p2) === mod(rhsInteger(curve, lifted.x), p2);
  return { digit, lifted, satisfiesCurveModP2 };
}

export function psiOverP(curve: Curve, lifted: AffinePoint): PsiStep {
  const { p } = curve;
  const p2 = p * p;
  const { point, ops } = mul(curve, p - 1n, lifted, p2);
  if (point === null) throw new Error('(p − 1)·P\' reduced to O modulo p², which cannot happen for a point of order p');
  const A = point;
  const xDiff = mod(lifted.x - A.x, p2);
  if (xDiff % p !== 0n) throw new Error('(p − 1)·P\' is not congruent to −P\' modulo p: the point does not have order p');
  const xDiffOverP = xDiff / p;
  const yDiff = mod(lifted.y - A.y, p);
  const psi = mod(xDiffOverP * modInv(yDiff, p), p);
  return { A, ops, xDiffOverP, yDiff, psiOverP: psi };
}

export function checkSmartPreconditions(curve: Curve, P: Point, Q: Point, certificate: PointCount): string | null {
  if (certificate.kind !== 'point-count' || !curvesEqual(certificate.curve, curve)) {
    return 'the point count presented is for a different curve; Smart\'s attack needs #E established for THIS curve';
  }
  if (certificate.order !== curve.p) {
    return `#E = ${certificate.order} but p = ${curve.p}: the curve is not anomalous (trace ${certificate.trace}, not 1), so the formal-group map ψ is not defined on p·P and Smart's attack does not apply`;
  }
  if (P === null) return 'P is the point at infinity and generates nothing';
  if (!isOnCurve(curve, P)) return `P = (${P.x}, ${P.y}) is not on the curve`;
  if (Q === null) return 'Q is the point at infinity: m = 0 by definition, and there is no y-coordinate to lift';
  if (!isOnCurve(curve, Q)) return `Q = (${Q.x}, ${Q.y}) is not on the curve`;
  if (P.y === 0n) return 'P has y = 0: the lift divides by 2y, so a 2-torsion point cannot be lifted (and a point of order 2 cannot generate a group of odd order p)';
  if (Q.y === 0n) return 'Q has y = 0: the lift divides by 2y, so it cannot be lifted';
  return null;
}

export function smartAttack(curve: Curve, P: Point, Q: Point, certificate: PointCount): SmartResult {
  const problem = checkSmartPreconditions(curve, P, Q, certificate);
  if (problem !== null) return { ok: false, kind: 'refused', reason: problem };
  const Pa = P as AffinePoint;
  const Qa = Q as AffinePoint;
  const { p } = curve;
  try {
    const liftP = liftPoint(curve, Pa);
    const liftQ = liftPoint(curve, Qa);
    const psiP = psiOverP(curve, liftP.lifted);
    const psiQ = psiOverP(curve, liftQ.lifted);
    const candidate = mod(psiQ.psiOverP * modInv(psiP.psiOverP, p), p);
    return {
      ok: true,
      candidate,
      trace: {
        p,
        p2: p * p,
        liftP,
        liftQ,
        psiP,
        psiQ,
        candidate,
        ops: psiP.ops + psiQ.ops,
        sqrtOps: sqrtMethodOps(p),
      },
    };
  } catch (error) {
    if (error instanceof NonInvertibleError) {
      return {
        ok: false,
        kind: 'failed',
        reason: `the arithmetic modulo p² tried to invert ${error.value}, which shares a factor with ${error.modulus}; the lifted points do not have the structure the attack assumes`,
      };
    }
    return { ok: false, kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
