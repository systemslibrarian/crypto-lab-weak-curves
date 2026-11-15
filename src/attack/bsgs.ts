/**
 * Baby-step giant-step over an abstract group.
 *
 * Shanks's algorithm: with m = ⌈√n⌉, tabulate α^j for 0 ≤ j < m (the baby
 * steps), then walk β·α^(−m·i) for 0 ≤ i < m (the giant steps) until it lands
 * in the table; then β = α^(i·m + j). About 2√n group operations, which is the
 * "square-root" cost every generic discrete-logarithm method pays — and the
 * number the page prints beside each attack's own operation count.
 *
 * It is written against an interface rather than against F_{p²} so the same
 * solver counts steps on the curve and in the field alike.
 */
import { isqrtCeil } from '../ec/field';

export interface Group<T> {
  readonly identity: T;
  mul(x: T, y: T): T;
  inv(x: T): T;
  /** Canonical hash key; two elements are equal iff their keys are. */
  key(x: T): string;
}

export interface BsgsResult {
  /** The logarithm in [0, n), or null when β is not a power of α. */
  readonly l: bigint | null;
  readonly m: bigint;
  readonly babySteps: number;
  readonly giantSteps: number;
}

// [extension] point — the field logarithm solver. An index-calculus exhibit
// would implement this same (Group, α, β, n) → l signature with a different
// algorithm, which is the only reason the solver is abstract rather than
// inlined in mov.ts.
export function bsgs<T>(G: Group<T>, alpha: T, beta: T, n: bigint): BsgsResult {
  if (n < 1n) throw new RangeError('the group order must be positive');
  const m = isqrtCeil(n);
  const table = new Map<string, bigint>();
  let babySteps = 0;
  let current = G.identity;
  for (let j = 0n; j < m; j++) {
    const key = G.key(current);
    if (!table.has(key)) table.set(key, j);
    current = G.mul(current, alpha);
    babySteps += 1;
  }
  // α^(−m): the stride of one giant step.
  const stride = G.inv(current);
  let gamma = beta;
  let giantSteps = 0;
  for (let i = 0n; i < m; i++) {
    const j = table.get(G.key(gamma));
    if (j !== undefined) {
      return { l: (i * m + j) % n, m, babySteps, giantSteps };
    }
    gamma = G.mul(gamma, stride);
    giantSteps += 1;
  }
  return { l: null, m, babySteps, giantSteps };
}

/** The operation count a generic square-root method needs for a group of order n: about 2⌈√n⌉. */
export function sqrtMethodOps(n: bigint): bigint {
  return 2n * isqrtCeil(n);
}
