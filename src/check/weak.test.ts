import { describe, expect, it } from 'vitest';
import { weakCurveChecks } from './weak';
import { MOV_INSTANCES, NAMED_CURVES, SEC1_STEP_8, SMART_1999, MONNERAT_2002 } from '../data/published';

describe('exhibit 5: the two cheap checks from SEC 1 v2.0 §3.1.1.2.1 step 8', () => {
  it('P-256 and secp256k1 pass both checks with B = 99 (1 ≤ B < 100)', () => {
    for (const named of NAMED_CURVES) {
      const report = weakCurveChecks(named.curve.p, named.n, SEC1_STEP_8.bound);
      expect(report.anomalous, named.name).toBe(false);
      expect(report.embedding, named.name).toEqual({ found: false, bound: 99 });
      expect(report.passesBoth).toBe(true);
    }
  });

  it("the lab's anomalous curves fail the first check (n = p)", () => {
    for (const example of [SMART_1999, MONNERAT_2002]) {
      const report = weakCurveChecks(example.curve.p, example.curve.p, SEC1_STEP_8.bound);
      expect(report.anomalous).toBe(true);
      expect(report.passesBoth).toBe(false);
    }
  });

  it("the lab's supersingular curves fail the second check at k = 2", () => {
    for (const { p, n } of MOV_INSTANCES) {
      const report = weakCurveChecks(p, n, SEC1_STEP_8.bound);
      expect(report.anomalous).toBe(false);
      expect(report.embedding).toEqual({ found: true, k: 2 });
      expect(report.passesBoth).toBe(false);
    }
  });

  it('the bound is the standard\'s: 99 is the largest exponent in 1 ≤ B < 100', () => {
    expect(SEC1_STEP_8.bound).toBe(99);
    expect(SEC1_STEP_8.wording).toContain('1 ≤ B < 100');
    expect(SEC1_STEP_8.wording).toContain('n ≠ p');
  });
});
