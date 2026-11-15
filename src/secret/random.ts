/**
 * Every secret scalar and every random point in the lab comes from here, and
 * everything here comes from `crypto.getRandomValues` through rejection
 * sampling: no modulo bias, and no use of the global pseudo-random generator
 * anywhere under src/ — which src/secret/random.test.ts proves by scanning the
 * source rather than by assertion. Tests inject a deterministic
 * `RandomSource`; the page never does.
 *
 * This module is the only one that ever holds a secret before the attack runs,
 * and nothing under src/attack/ imports it.
 */
import { discriminant, rhs, type Curve, type Point } from '../ec/curve';
import { bitLength, isProbablePrime, sqrtMod } from '../ec/field';

export interface RandomSource {
  /** Fill the buffer with uniformly random bytes. */
  fill(buffer: Uint8Array<ArrayBuffer>): void;
}

export const webCryptoSource: RandomSource = {
  fill(buffer) {
    crypto.getRandomValues(buffer);
  },
};

/** Uniform integer in [0, bound), by rejection on the minimal number of bits. */
export function randomBelow(bound: bigint, source: RandomSource = webCryptoSource): bigint {
  if (bound <= 0n) throw new RangeError('bound must be positive');
  if (bound === 1n) return 0n;
  const bits = bitLength(bound - 1n);
  const bytes = Math.ceil(bits / 8);
  const spare = bytes * 8 - bits;
  const buffer = new Uint8Array(bytes);
  for (;;) {
    source.fill(buffer);
    buffer[0] &= 0xff >> spare;
    let value = 0n;
    for (const byte of buffer) value = (value << 8n) | BigInt(byte);
    if (value < bound) return value;
  }
}

/** A secret scalar in [1, n − 1]. */
export function randomScalar(n: bigint, source: RandomSource = webCryptoSource): bigint {
  if (n < 2n) throw new RangeError('n must be at least 2');
  return 1n + randomBelow(n - 1n, source);
}

/** A uniformly random affine point with y ≠ 0 (so it can be lifted), by random x and a coin for the sign of y. */
export function randomPoint(curve: Curve, source: RandomSource = webCryptoSource): Point {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const x = randomBelow(curve.p, source);
    const f = rhs(curve, x);
    if (f === 0n) continue;
    const y = sqrtMod(f, curve.p);
    if (y === null) continue;
    return { x, y: randomBelow(2n, source) === 0n ? y : curve.p - y };
  }
  throw new Error('no affine point with y ≠ 0 found in 10000 draws');
}

/** A random prime in [lo, hi], by rejection. */
export function randomPrime(lo: bigint, hi: bigint, source: RandomSource = webCryptoSource): bigint {
  if (hi < lo) throw new RangeError('empty range');
  for (let attempt = 0; attempt < 100_000; attempt++) {
    const candidate = lo + randomBelow(hi - lo + 1n, source);
    if (isProbablePrime(candidate)) return candidate;
  }
  throw new Error(`no prime found in [${lo}, ${hi}]`);
}

/** A random non-singular short Weierstrass curve y² = x³ + a4·x + a6 over F_p. */
export function randomCurve(p: bigint, source: RandomSource = webCryptoSource): Curve {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const curve: Curve = { p, a2: 0n, a4: randomBelow(p, source), a6: randomBelow(p, source) };
    if (discriminant(curve) !== 0n) return curve;
  }
  throw new Error('no non-singular curve found');
}
