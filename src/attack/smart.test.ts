/**
 * Every expected value below comes from the published worked example it names —
 * Smart, J. Cryptology 12(3) (1999) 193-196, and Monnerat, EPFL IC/2002/49 —
 * and was independently recomputed twice before this lab was written. None of
 * them was read off this implementation, which is the only reason they can
 * judge it.
 */
import { describe, expect, it } from 'vitest';
import { checkSmartPreconditions, liftPoint, psiOverP, smartAttack } from './smart';
import { countPoints, type PointCount } from '../ec/count';
import { mul, type Curve, type Point } from '../ec/curve';
import { verifyLogarithm } from '../check/verify';
import { MONNERAT_2002, NOT_ANOMALOUS_DEMO, SMART_1999 } from '../data/published';
import { randomPoint, randomScalar } from '../secret/random';
import { seededSource } from '../testing/seeded';

function certify(curve: Curve): PointCount {
  const result = countPoints(curve);
  if (!result.ok) throw new Error(result.detail);
  return result.count;
}

describe("Smart's attack — Smart's published example (p = 43)", () => {
  const { curve, P, Q } = SMART_1999;
  const certificate = certify(curve);

  it('lift digits are 20 for P and 40 for Q, so the lifted y-coordinates are 876 and 1756 mod 1849', () => {
    const liftP = liftPoint(curve, P);
    const liftQ = liftPoint(curve, Q);
    expect(liftP.digit).toBe(20n);
    expect(liftQ.digit).toBe(40n);
    expect(liftP.lifted).toEqual({ x: 0n, y: 876n });
    expect(liftQ.lifted).toEqual({ x: 10n, y: 1756n });
    expect(liftP.satisfiesCurveModP2).toBe(true);
    expect(liftQ.satisfiesCurveModP2).toBe(true);
  });

  it('ψ(pP′)/p = 19 and ψ(pQ′)/p = 3', () => {
    expect(psiOverP(curve, liftPoint(curve, P).lifted).psiOverP).toBe(19n);
    expect(psiOverP(curve, liftPoint(curve, Q).lifted).psiOverP).toBe(3n);
  });

  it('m = 3 · 19⁻¹ mod 43 = 16, and the independent verifier confirms 16·P = Q', () => {
    const result = smartAttack(curve, P, Q, certificate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate).toBe(16n);
    expect(verifyLogarithm(curve, P, Q, result.candidate).ok).toBe(true);
    expect(result.trace.ops).toBeGreaterThan(0);
    expect(result.trace.sqrtOps).toBe(14n); // 2·⌈√43⌉
  });
});

describe("Smart's attack — Monnerat's published example (p = 1019)", () => {
  const { curve, P, Q } = MONNERAT_2002;
  const certificate = certify(curve);

  it('lift digits are 308 and 561; ψ(pP′)/p = 367 and ψ(pQ′)/p = 305', () => {
    const liftP = liftPoint(curve, P);
    const liftQ = liftPoint(curve, Q);
    expect(liftP.digit).toBe(308n);
    expect(liftQ.digit).toBe(561n);
    expect(psiOverP(curve, liftP.lifted).psiOverP).toBe(367n);
    expect(psiOverP(curve, liftQ.lifted).psiOverP).toBe(305n);
  });

  it('m = 123, and 123·P = Q', () => {
    const result = smartAttack(curve, P, Q, certificate);
    expect(result.ok && result.candidate).toBe(123n);
    expect(verifyLogarithm(curve, P, Q, 123n).ok).toBe(true);
  });
});

describe("Smart's attack — cost", () => {
  it('uses O(log p) curve operations: two multiplications by p − 1 modulo p², far below 2√p once p grows', () => {
    const { curve, P, Q } = MONNERAT_2002;
    const result = smartAttack(curve, P, Q, certify(curve));
    if (!result.ok) throw new Error(result.reason);
    // log₂(1018) ≈ 10 doublings plus at most 10 additions, twice.
    expect(result.trace.ops).toBeLessThanOrEqual(2 * 2 * 10);
    expect(result.trace.ops).toBe(result.trace.psiP.ops + result.trace.psiQ.ops);
    expect(result.trace.sqrtOps).toBe(64n); // 2·⌈√1019⌉ = 2·32
  });
});

describe("Smart's attack — fail-closed paths", () => {
  const { curve, P, Q } = SMART_1999;
  const certificate = certify(curve);

  it('refuses a curve that is not anomalous, naming #E and p, and never returns a number', () => {
    const demo = NOT_ANOMALOUS_DEMO;
    const demoCertificate = certify(demo.curve);
    expect(demoCertificate.order).not.toBe(demo.curve.p); // precondition of this test, counted live
    const result = smartAttack(demo.curve, demo.P, demo.Q, demoCertificate);
    expect(result).toMatchObject({ ok: false, kind: 'refused' });
    expect(!result.ok && result.reason).toMatch(/#E = 48 but p = 43/);
    expect(!result.ok && result.reason).toMatch(/not anomalous/);
  });

  it('refuses a certificate issued for a different curve', () => {
    const other = certify(MONNERAT_2002.curve);
    const result = smartAttack(curve, P, Q, other);
    expect(result).toMatchObject({ ok: false, kind: 'refused' });
    expect(!result.ok && result.reason).toMatch(/different curve/);
  });

  it('refuses P = O', () => {
    expect(checkSmartPreconditions(curve, null, Q, certificate)).toMatch(/P is the point at infinity/);
  });

  it('refuses Q = O (m = 0): there is no y to lift and the answer is 0 by definition', () => {
    const result = smartAttack(curve, P, null, certificate);
    expect(result).toMatchObject({ ok: false, kind: 'refused' });
    expect(!result.ok && result.reason).toMatch(/m = 0/);
  });

  it('refuses a point with y = 0, saying the lift divides by 2y', () => {
    // y² = x³ + x over F_1019 has the 2-torsion point (0, 0); its certificate is not anomalous either,
    // so build a tailor-made anomalous situation: fake nothing — just assert the precondition text.
    const twoTorsion: Point = { x: 0n, y: 0n };
    const ssCurve = { p: 1019n, a2: 0n, a4: 1n, a6: 0n };
    const message = checkSmartPreconditions(ssCurve, twoTorsion, twoTorsion, {
      kind: 'point-count',
      curve: ssCurve,
      order: 1019n, // a deliberately false certificate, to reach the y = 0 branch in isolation
      trace: 1n,
    });
    expect(message).toMatch(/y = 0/);
    expect(message).toMatch(/2y/);
  });

  it('refuses points that are not on the curve', () => {
    expect(checkSmartPreconditions(curve, { x: 1n, y: 1n }, Q, certificate)).toMatch(/not on the curve/);
    expect(checkSmartPreconditions(curve, P, { x: 10n, y: 35n }, certificate)).toMatch(/not on the curve/);
  });

  it('m = 1 (Q = P) is recovered as 1', () => {
    const result = smartAttack(curve, P, P, certificate);
    expect(result.ok && result.candidate).toBe(1n);
  });

  it('m = p − 1 (Q = −P) is recovered as p − 1', () => {
    const minusP = { x: P.x, y: curve.p - P.y };
    const result = smartAttack(curve, P, minusP, certificate);
    expect(result.ok && result.candidate).toBe(42n);
    expect(verifyLogarithm(curve, P, minusP, 42n).ok).toBe(true);
  });
});

describe("Smart's attack — isolation of the secret", () => {
  it('the attacker is constructed from (curve, P, certificate) before the secret exists, and still recovers it', () => {
    const { curve } = MONNERAT_2002;
    const certificate = certify(curve);
    const source = seededSource(2026);
    const P = randomPoint(curve, source);
    // The attacker closure is complete here; no secret has been drawn yet.
    const attacker = (Q: Point) => smartAttack(curve, P, Q, certificate);
    const secret = randomScalar(curve.p, source);
    const Q = mul(curve, secret, P).point;
    const result = attacker(Q);
    expect(result.ok && result.candidate).toBe(secret);
    expect(verifyLogarithm(curve, P, Q, secret).ok).toBe(true);
  });

  it('recovers twenty seeded secrets on Monnerat\'s curve, each confirmed by the independent verifier', () => {
    const { curve } = MONNERAT_2002;
    const certificate = certify(curve);
    const source = seededSource(7);
    for (let i = 0; i < 20; i++) {
      const P = randomPoint(curve, source);
      const secret = randomScalar(curve.p, source);
      const Q = mul(curve, secret, P).point;
      const result = smartAttack(curve, P, Q, certificate);
      expect(result.ok, `trial ${i}`).toBe(true);
      if (!result.ok) continue;
      expect(result.candidate).toBe(secret);
      expect(verifyLogarithm(curve, P, Q, result.candidate).ok).toBe(true);
    }
  });
});
