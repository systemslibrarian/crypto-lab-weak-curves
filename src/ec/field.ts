/**
 * Exact integer arithmetic modulo m, on BigInt only.
 *
 * Everything the lab computes — field elements, curve points, pairing values,
 * p-adic digits — passes through these few functions, so there is no floating
 * point anywhere in the arithmetic: every value is an exact integer. The
 * modulus is not
 * assumed prime: Smart's attack works modulo p², which is a ring, and the one
 * operation that can fail there (inversion of a multiple of p) throws a typed
 * error rather than returning a wrong number.
 */

export class NonInvertibleError extends Error {
  constructor(
    readonly value: bigint,
    readonly modulus: bigint,
  ) {
    super(`${value} has no inverse modulo ${modulus}`);
    this.name = 'NonInvertibleError';
  }
}

/** Least non-negative residue. */
export function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

export function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Inverse of a modulo m by the extended Euclidean algorithm. Throws when gcd(a, m) ≠ 1. */
export function modInv(a: bigint, m: bigint): bigint {
  if (m <= 1n) throw new NonInvertibleError(a, m);
  let [oldR, r] = [mod(a, m), m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new NonInvertibleError(a, m);
  return mod(oldS, m);
}

/** b^e mod m by square-and-multiply; e ≥ 0. */
export function modPow(b: bigint, e: bigint, m: bigint): bigint {
  if (e < 0n) throw new RangeError('negative exponent');
  let result = 1n % m;
  let base = mod(b, m);
  while (e > 0n) {
    if (e & 1n) result = (result * base) % m;
    base = (base * base) % m;
    e >>= 1n;
  }
  return result;
}

export function bitLength(n: bigint): number {
  if (n < 0n) n = -n;
  return n === 0n ? 0 : n.toString(2).length;
}

/** Floor of the square root. */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError('isqrt of a negative number');
  if (n < 2n) return n;
  let x = BigInt(1) << BigInt(Math.ceil(bitLength(n) / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Ceiling of the square root. */
export function isqrtCeil(n: bigint): bigint {
  const r = isqrt(n);
  return r * r === n ? r : r + 1n;
}

const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

/**
 * Miller–Rabin with the first twelve prime bases. Deterministic for every
 * n < 3.3 × 10²⁴ (Sorenson–Webster 2015); for the 256-bit named-curve primes it
 * is a probabilistic test, and the page says so where it reports the result.
 */
export function isProbablePrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const b of MR_BASES) {
    if (n === b) return true;
    if (n % b === 0n) return false;
  }
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s += 1;
  }
  outer: for (const a of MR_BASES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

/** Legendre symbol (a | p) for an odd prime p, by Euler's criterion. */
export function legendre(a: bigint, p: bigint): -1 | 0 | 1 {
  const r = mod(a, p);
  if (r === 0n) return 0;
  return modPow(r, (p - 1n) >> 1n, p) === 1n ? 1 : -1;
}

/** A square root of a modulo an odd prime p (Tonelli–Shanks), or null when a is a non-residue. */
export function sqrtMod(a: bigint, p: bigint): bigint | null {
  a = mod(a, p);
  if (a === 0n) return 0n;
  if (legendre(a, p) !== 1) return null;
  if (p % 4n === 3n) return modPow(a, (p + 1n) >> 2n, p);
  let q = p - 1n;
  let s = 0n;
  while ((q & 1n) === 0n) {
    q >>= 1n;
    s += 1n;
  }
  let z = 2n;
  while (legendre(z, p) !== -1) z += 1n;
  let m = s;
  let c = modPow(z, q, p);
  let t = modPow(a, q, p);
  let r = modPow(a, (q + 1n) >> 1n, p);
  while (t !== 1n) {
    let i = 0n;
    let tt = t;
    while (tt !== 1n) {
      tt = (tt * tt) % p;
      i += 1n;
      if (i === m) return null;
    }
    let b = c;
    for (let j = 0n; j < m - i - 1n; j++) b = (b * b) % p;
    m = i;
    c = (b * b) % p;
    t = (t * c) % p;
    r = (r * b) % p;
  }
  return r;
}

export interface PrimePower {
  readonly prime: bigint;
  readonly exponent: number;
}

/** Trial-division factorisation. Fails closed above 2⁶⁴ rather than running for hours. */
export const FACTOR_CAP = 1n << 64n;

export function factorise(n: bigint): PrimePower[] {
  if (n < 1n) throw new RangeError('factorise needs a positive integer');
  if (n > FACTOR_CAP) throw new RangeError(`factorise refuses integers above 2^64 (got ${bitLength(n)} bits)`);
  const out: PrimePower[] = [];
  let rest = n;
  const push = (prime: bigint): void => {
    let exponent = 0;
    while (rest % prime === 0n) {
      rest /= prime;
      exponent += 1;
    }
    if (exponent > 0) out.push({ prime, exponent });
  };
  push(2n);
  push(3n);
  for (let d = 5n; d * d <= rest; d += 6n) {
    push(d);
    push(d + 2n);
  }
  if (rest > 1n) out.push({ prime: rest, exponent: 1 });
  return out;
}

export function formatFactorisation(factors: readonly PrimePower[]): string {
  if (factors.length === 0) return '1';
  return factors.map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}^${f.exponent}`)).join(' · ');
}
