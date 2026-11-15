/**
 * The MOV reduction on y² = x³ + a4·x, p ≡ 3 (mod 4), for a prime n | p + 1.
 *
 * The attacker receives (curve, n, P, R) and NOTHING ELSE — in particular,
 * never the secret. It returns a CANDIDATE logarithm and never a verdict:
 * whether l·P = R is decided by src/check/verify.ts, which this module does not
 * import and which does not import this module.
 *
 * Steps, numbered as the page shows them:
 *   1. preconditions (p prime, p ≡ 3 mod 4, n prime, n | p + 1, P of order n);
 *   2. φ(P) = (−x, i·y), an independent point of order n;
 *   3. α = t(P, φ(P))  — Miller loop, then the final exponentiation;
 *   4. β = t(R, φ(P));
 *   5. l with α^l = β, by baby-step giant-step in the order-n subgroup of F_{p²}*.
 */
import { isOnCurve, mul, type Point } from '../ec/curve';
import { isProbablePrime } from '../ec/field';
import { makeFp2, type Fp2, type Fp2Field } from '../ec/fp2';
import { bsgs, sqrtMethodOps, type BsgsResult } from './bsgs';
import { distort, isOnCurveFp2, reducedTate, type Fp2Point, type PairingCurve, type TateResult } from './pairing';

export interface MovInput {
  readonly curve: PairingCurve;
  readonly n: bigint;
  readonly P: Point;
  readonly R: Point;
}

export interface MovTrace {
  readonly field: Fp2Field;
  readonly phi: Fp2Point;
  readonly alpha: TateResult;
  readonly beta: TateResult;
  readonly search: BsgsResult;
  /** 2⌈√n⌉: what a generic method on the curve itself would cost. */
  readonly sqrtOps: bigint;
}

export type MovResult =
  | { readonly ok: false; readonly kind: 'refused'; readonly reason: string }
  | { readonly ok: true; readonly trace: MovTrace; readonly candidate: bigint | null };

function refuse(reason: string): MovResult {
  return { ok: false, kind: 'refused', reason };
}

export function checkMovPreconditions(input: MovInput): string | null {
  const { curve, n, P, R } = input;
  const weierstrass = { p: curve.p, a2: 0n, a4: curve.a4, a6: 0n };
  if (!isProbablePrime(curve.p)) return `p = ${curve.p} is not prime`;
  if (curve.p % 4n !== 3n) return `p ≡ ${curve.p % 4n} (mod 4); this exhibit needs p ≡ 3 (mod 4) so that i² + 1 is irreducible and y² = x³ + ${curve.a4}x is supersingular`;
  if (curve.a4 % curve.p === 0n) return 'a4 ≡ 0 makes the curve singular';
  if (!isProbablePrime(n)) return `n = ${n} is not prime`;
  if ((curve.p + 1n) % n !== 0n) return `n = ${n} does not divide p + 1 = ${curve.p + 1n}, so n is not the order of a subgroup of this curve and the embedding-degree-2 argument does not apply`;
  if (P === null) return 'P is the point at infinity';
  if (!isOnCurve(weierstrass, P)) return `P = (${P.x}, ${P.y}) is not on the curve`;
  if (mul(weierstrass, n, P).point !== null) return `n·P ≠ O: P does not have order n`;
  if (R === null) return 'R is the point at infinity, so its logarithm is 0 by definition and there is nothing to reduce';
  if (!isOnCurve(weierstrass, R)) return `R = (${R.x}, ${R.y}) is not on the curve`;
  return null;
}

export function movAttack(input: MovInput): MovResult {
  const problem = checkMovPreconditions(input);
  if (problem !== null) return refuse(problem);
  const { curve, n, P, R } = input;
  const F = makeFp2(curve.p);
  const phi = distort(F, P);
  if (phi === null || !isOnCurveFp2(F, curve, phi)) return refuse('the distortion map did not land on the curve');

  const alpha = reducedTate(F, curve, n, P, phi);
  if (F.isOne(alpha.value)) {
    return refuse('degenerate pairing: t(P, φ(P)) = 1, so the order-n subgroup of F_{p²}* receives nothing and no logarithm can be read there');
  }
  const beta = reducedTate(F, curve, n, R, phi);

  const group = {
    identity: F.one,
    mul: (x: Fp2, y: Fp2): Fp2 => F.mul(x, y),
    inv: (x: Fp2): Fp2 => F.inv(x),
    key: (x: Fp2): string => F.key(x),
  };
  const search = bsgs(group, alpha.value, beta.value, n);
  return {
    ok: true,
    trace: { field: F, phi, alpha, beta, search, sqrtOps: sqrtMethodOps(n) },
    candidate: search.l,
  };
}
