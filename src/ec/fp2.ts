/**
 * The quadratic extension F_{p²} = F_p[i] / (i² + 1), for p ≡ 3 (mod 4).
 *
 * That congruence is what makes i² + 1 irreducible (−1 is then a non-residue),
 * and it is the same congruence that makes y² = x³ + x supersingular with
 * #E = p + 1 — so one condition buys both the field the MOV reduction lands in
 * and the curve it attacks. Elements print as `a + b·i`.
 */
import { mod, modInv } from './field';

export interface Fp2 {
  readonly a: bigint;
  readonly b: bigint;
}

export interface Fp2Field {
  readonly p: bigint;
  readonly zero: Fp2;
  readonly one: Fp2;
  el(a: bigint, b: bigint): Fp2;
  add(x: Fp2, y: Fp2): Fp2;
  sub(x: Fp2, y: Fp2): Fp2;
  neg(x: Fp2): Fp2;
  mul(x: Fp2, y: Fp2): Fp2;
  sqr(x: Fp2): Fp2;
  inv(x: Fp2): Fp2;
  pow(x: Fp2, e: bigint): Fp2;
  eq(x: Fp2, y: Fp2): boolean;
  isZero(x: Fp2): boolean;
  isOne(x: Fp2): boolean;
  /** A canonical string, used as the hash key in baby-step giant-step. */
  key(x: Fp2): string;
  format(x: Fp2): string;
}

export function makeFp2(p: bigint): Fp2Field {
  if (p % 4n !== 3n) {
    throw new RangeError(`F_p[i]/(i² + 1) is a field only for p ≡ 3 (mod 4); p = ${p} ≡ ${p % 4n}`);
  }
  const el = (a: bigint, b: bigint): Fp2 => ({ a: mod(a, p), b: mod(b, p) });
  const zero = el(0n, 0n);
  const one = el(1n, 0n);
  const add = (x: Fp2, y: Fp2): Fp2 => el(x.a + y.a, x.b + y.b);
  const sub = (x: Fp2, y: Fp2): Fp2 => el(x.a - y.a, x.b - y.b);
  const neg = (x: Fp2): Fp2 => el(-x.a, -x.b);
  const mul = (x: Fp2, y: Fp2): Fp2 => el(x.a * y.a - x.b * y.b, x.a * y.b + x.b * y.a);
  const sqr = (x: Fp2): Fp2 => mul(x, x);
  const inv = (x: Fp2): Fp2 => {
    // (a + bi)⁻¹ = (a − bi) / (a² + b²); the norm is in F_p and is zero only for 0.
    const norm = modInv(mod(x.a * x.a + x.b * x.b, p), p);
    return el(x.a * norm, -x.b * norm);
  };
  const pow = (x: Fp2, e: bigint): Fp2 => {
    if (e < 0n) throw new RangeError('negative exponent');
    let result = one;
    let base = x;
    while (e > 0n) {
      if (e & 1n) result = mul(result, base);
      base = sqr(base);
      e >>= 1n;
    }
    return result;
  };
  const eq = (x: Fp2, y: Fp2): boolean => x.a === y.a && x.b === y.b;
  return {
    p,
    zero,
    one,
    el,
    add,
    sub,
    neg,
    mul,
    sqr,
    inv,
    pow,
    eq,
    isZero: (x) => x.a === 0n && x.b === 0n,
    isOne: (x) => x.a === 1n && x.b === 0n,
    key: (x) => `${x.a},${x.b}`,
    format: (x) => `${x.a} + ${x.b}·i`,
  };
}
