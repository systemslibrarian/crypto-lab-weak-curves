/**
 * Exhibit 5's two cheap checks, exactly as SEC 1 v2.0 §3.1.1.2.1 step 8 states
 * them for a prime-order subgroup of size n over F_p:
 *
 *   (a) n ≠ p                                  — not anomalous;
 *   (b) p^k ≢ 1 (mod n) for every 1 ≤ k ≤ B   — no small embedding degree.
 *
 * They are necessary conditions, not a security proof: a curve that passes
 * both can still be weak for reasons this page does not test (small cofactor
 * subgroups, a twist with smooth order, an invalid-curve service, ...). The
 * page says exactly that beside the results.
 */
import { embeddingDegree, type EmbeddingDegree } from '../ec/count';

export interface WeakCurveReport {
  readonly p: bigint;
  readonly n: bigint;
  readonly bound: number;
  /** n = p: Smart's attack applies. */
  readonly anomalous: boolean;
  /** The smallest k ≤ bound with p^k ≡ 1 (mod n), or "greater than the bound". */
  readonly embedding: EmbeddingDegree;
  /** Both checks passed. Says nothing about any other weakness. */
  readonly passesBoth: boolean;
}

// [extension] point — the weak-curve checker. Further conditions (a cofactor
// with small prime factors, the order of the quadratic twist) would be added
// as more fields of this report, each with its own verdict on the page.
export function weakCurveChecks(p: bigint, n: bigint, bound: number): WeakCurveReport {
  const anomalous = n === p;
  const embedding = embeddingDegree(p, n, bound);
  return { p, n, bound, anomalous, embedding, passesBoth: !anomalous && !embedding.found };
}
