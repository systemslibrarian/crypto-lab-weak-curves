import { describe, expect, it } from 'vitest';
import { findAnomalousCurve, SEARCH_PRIME_CAP } from './search';
import { countPoints } from './count';
import { seededSource } from '../testing/seeded';

describe('exhibit 3: searching for an anomalous curve', () => {
  it('finds a curve with exactly p points over F_1019 and reports the attempts it took', () => {
    const result = findAnomalousCurve(1019n, seededSource(11));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count.order).toBe(1019n);
    expect(result.attempts).toBeGreaterThan(0);
    // Recount independently of the search's own certificate.
    const recount = countPoints(result.curve);
    expect(recount.ok && recount.count.order).toBe(1019n);
  });

  it('refuses p above the search cap with the reason', () => {
    const result = findAnomalousCurve(SEARCH_PRIME_CAP + 3n, seededSource(1));
    expect(result).toMatchObject({ ok: false, reason: 'p-above-cap' });
  });

  it('reports exhaustion honestly when the attempt budget runs out', () => {
    const result = findAnomalousCurve(1019n, seededSource(2), 1);
    if (result.ok) return; // one lucky draw is legal; the property under test is the failure shape
    expect(result).toMatchObject({ ok: false, reason: 'exhausted', attempts: 1 });
  });
});
