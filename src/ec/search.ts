/**
 * Exhibit 3's search: random curves over F_p until one has exactly p points.
 *
 * Toy scale by construction — the count is by enumeration, so p is capped —
 * and honest about it: at real sizes anomalous curves are produced by the
 * complex-multiplication method, which is out of scope and named as such on
 * the page. The search reports how many curves it tried.
 */
import { countPoints, type PointCount } from './count';
import type { Curve } from './curve';
import { randomCurve, webCryptoSource, type RandomSource } from '../secret/random';

/** Above this the search is refused: each attempt costs p residue lookups and about 2√p attempts are expected. */
export const SEARCH_PRIME_CAP = 4_000n;
export const SEARCH_ATTEMPT_CAP = 4_000;

export type SearchResult =
  | { readonly ok: true; readonly curve: Curve; readonly count: PointCount; readonly attempts: number }
  | {
      readonly ok: false;
      readonly reason: 'p-above-cap' | 'exhausted';
      readonly attempts: number;
      readonly detail: string;
    };

export function findAnomalousCurve(
  p: bigint,
  source: RandomSource = webCryptoSource,
  maxAttempts = SEARCH_ATTEMPT_CAP,
): SearchResult {
  if (p > SEARCH_PRIME_CAP) {
    return {
      ok: false,
      reason: 'p-above-cap',
      attempts: 0,
      detail: `p = ${p} is above the search cap of ${SEARCH_PRIME_CAP}; each attempt counts p points by enumeration and about 2√p attempts are expected`,
    };
  }
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const curve = randomCurve(p, source);
    const counted = countPoints(curve);
    if (!counted.ok) {
      return { ok: false, reason: 'p-above-cap', attempts, detail: counted.detail };
    }
    if (counted.count.order === p) return { ok: true, curve, count: counted.count, attempts };
  }
  return {
    ok: false,
    reason: 'exhausted',
    attempts: maxAttempts,
    detail: `no curve with exactly ${p} points in ${maxAttempts} random curves over F_${p}`,
  };
}
