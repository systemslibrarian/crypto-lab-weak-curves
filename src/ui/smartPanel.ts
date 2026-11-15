/**
 * Exhibit 2 — Smart's attack, stepped.
 *
 * The attacker gets (curve, P, Q) and the point-count certificate. It returns
 * a candidate; the verdict is the independent verifier's, and nothing else.
 */
import { smartAttack, type SmartTrace } from '../attack/smart';
import { verifyLogarithm } from '../check/verify';
import { countPoints } from '../ec/count';
import { formatCurve, validateCurve, type Curve, type Point } from '../ec/curve';
import { MONNERAT_2002, NOT_ANOMALOUS_DEMO, SMART_1999 } from '../data/published';
import { button, claim, controls, field, group, h, integerInput, nonGoal, note, panelIntro, row, stepper, verdict } from './dom';
import { parseInteger, pointText } from './format';
import { resultSlot } from './retire';

export function renderSmartPanel(root: HTMLElement): void {
  root.append(
    panelIntro(
      "2 · Smart's attack, stepped",
      'When a curve has exactly p points, the group of points and the integers modulo p have the same size — and it turns out they are the same group in disguise. Smart’s attack builds the disguise explicitly: it lifts each point one level up, from arithmetic modulo p to arithmetic modulo p², where a hidden linear structure becomes visible and the logarithm falls out of one division.',
      'This exhibit reproduces the two published worked examples. Each press reveals one arithmetic step: the lift digit, the multiplication modulo p², the two ψ values, the division — and then a check that has nothing to do with the attack: does m·P really equal Q on the original curve?',
    ),
  );

  const p = integerInput('smart-p', 'p', '43', { width: 'narrow' });
  const a2 = integerInput('smart-a2', 'a₂', '39', { width: 'narrow' });
  const a4 = integerInput('smart-a4', 'a₄', '1', { width: 'narrow' });
  const a6 = integerInput('smart-a6', 'a₆', '41', { width: 'narrow' });
  const px = integerInput('smart-px', 'P.x', '0', { width: 'narrow' });
  const py = integerInput('smart-py', 'P.y', '16', { width: 'narrow' });
  const qx = integerInput('smart-qx', 'Q.x', '10', { width: 'narrow' });
  const qy = integerInput('smart-qy', 'Q.y', '36', { width: 'narrow' });
  const inputs = [p.input, a2.input, a4.input, a6.input, px.input, py.input, qx.input, qy.input];
  const key = (): string => inputs.map((i) => i.value.trim()).join('|');

  const load = (c: Curve, P: Point, Q: Point): void => {
    const vals = [c.p, c.a2, c.a4, c.a6, P?.x ?? 0n, P?.y ?? 0n, Q?.x ?? 0n, Q?.y ?? 0n];
    inputs.forEach((input, i) => (input.value = String(vals[i])));
    slot.sync(key());
  };

  const presets = group(
    'Published examples',
    button(SMART_1999.title, { id: 'smart-preset-smart', onclick: () => load(SMART_1999.curve, SMART_1999.P, SMART_1999.Q) }),
    button(MONNERAT_2002.title, { id: 'smart-preset-monnerat', onclick: () => load(MONNERAT_2002.curve, MONNERAT_2002.P, MONNERAT_2002.Q) }),
    button(NOT_ANOMALOUS_DEMO.title, { id: 'smart-preset-refused', onclick: () => load(NOT_ANOMALOUS_DEMO.curve, NOT_ANOMALOUS_DEMO.P, NOT_ANOMALOUS_DEMO.Q) }),
  );
  const run = button('Run the attack', { id: 'smart-run', primary: true, onclick: () => compute() });

  root.append(
    controls(
      h('p', { class: 'control-label' }, 'Curve y² = x³ + a₂x² + a₄x + a₆, the base point P and the target Q = m·P'),
      row(p.control, a2.control, a4.control, a6.control),
      row(px.control, py.control, qx.control, qy.control),
      presets,
      row(run),
    ),
  );

  const slot = resultSlot(root, 'The attack output was retired because the curve or the points changed. Run again to recompute.');
  for (const input of inputs) input.addEventListener('input', () => slot.sync(key()));

  root.append(
    nonGoal('generating large anomalous curves. The attack is linear-time at ANY size; what keeps this exhibit small is only that anomalous curves of cryptographic size are produced by the complex-multiplication method, which is out of scope.'),
    note('info', 'Also credited with the attack, independently and in the same year: Satoh and Araki (Comment. Math. Univ. St. Pauli 47, 1998) and Semaev (Math. Comp. 67, 1998). This exhibit follows Smart’s presentation and Monnerat’s tutorial.'),
  );

  function compute(): void {
    const out = h('div', { class: 'output' });
    const values = inputs.map((i) => parseInteger(i.value));
    if (values.some((v) => v === null)) {
      out.append(verdict('smart-result', 'fail', 'REFUSED — every field must be a non-negative integer'));
      slot.show(out, key());
      return;
    }
    const [pv, a2v, a4v, a6v, pxv, pyv, qxv, qyv] = values as bigint[];
    const validated = validateCurve(pv, a2v, a4v, a6v);
    if (!validated.ok) {
      out.append(verdict('smart-result', 'fail', 'REFUSED — the curve is not usable', validated.detail));
      slot.show(out, key());
      return;
    }
    const curve = validated.curve;
    const counted = countPoints(curve);
    if (!counted.ok) {
      out.append(verdict('smart-result', 'fail', 'REFUSED — p above the enumeration cap', counted.detail));
      slot.show(out, key());
      return;
    }
    const P: Point = { x: pxv, y: pyv };
    const Q: Point = { x: qxv, y: qyv };
    const result = smartAttack(curve, P, Q, counted.count);
    out.append(field('Curve', `${formatCurve(curve)} over F_${pv}`), field('P', pointText(P)), field('Q', pointText(Q)));
    if (!result.ok) {
      out.append(
        verdict('smart-result', 'fail', result.kind === 'refused' ? 'REFUSED — Smart’s attack does not apply' : 'ATTACK FAILED — no number was produced', result.reason),
      );
      slot.show(out, key());
      return;
    }
    const t = result.trace;
    const check = verifyLogarithm(curve, P, Q, result.candidate);
    out.append(buildStepper(t, pv, Q, check.ok, check.computed, counted.count.order).element);
    slot.show(out, key());
  }

  load(SMART_1999.curve, SMART_1999.P, SMART_1999.Q);
  compute();
}

export function buildStepper(
  t: SmartTrace,
  p: bigint,
  Q: Point,
  verified: boolean,
  computed: Point,
  order: bigint,
  idPrefix = 'smart',
  markerId = 'smart-result',
): ReturnType<typeof stepper> {
  const m = t.candidate;
  const lines: HTMLElement[] = [
    h('div', {},
      h('p', {}, `#E = ${order} = p. The curve is anomalous, so the attack may proceed. (A curve with any other count is refused before this line — see the third preset.)`)),
    h('div', {},
      h('p', {}, `Keep x, change y so the equation holds modulo p² = ${t.p2}. The Hensel digit is t = ((f(x) − y²)/p)·(2y)⁻¹ mod p.`),
      claim(`${idPrefix}-liftP`, 'Lift digit for P', String(t.liftP.digit), { raw: String(t.liftP.digit) }),
      field("P′ = (x, y + t·p) mod p²", pointText(t.liftP.lifted)),
      field('Check y′² ≡ f(x) (mod p²)', t.liftP.satisfiesCurveModP2 ? 'holds' : 'FAILS')),
    h('div', {},
      claim(`${idPrefix}-liftQ`, 'Lift digit for Q', String(t.liftQ.digit), { raw: String(t.liftQ.digit) }),
      field("Q′ = (x, y + t·p) mod p²", pointText(t.liftQ.lifted)),
      field('Check y′² ≡ f(x) (mod p²)', t.liftQ.satisfiesCurveModP2 ? 'holds' : 'FAILS')),
    h('div', {},
      h('p', {}, 'Multiply P′ by p − 1 with the ordinary affine formulas, all modulo p². The last step, adding P′ once more to reach p·P′, would divide by x₂ − x₁, a multiple of p — so the p-adic value is read from that last slope instead.'),
      field('A = (p − 1)·P′ mod p²', pointText(t.psiP.A)),
      claim(`${idPrefix}-opsP`, 'Curve operations spent', String(t.psiP.ops), { raw: String(t.psiP.ops) })),
    h('div', {},
      h('p', {}, 'p·P′ reduces to O modulo p, so it lies in the formal group, where ψ(S) = −x(S)/y(S) is additive. With A = (x₁, y₁) and P′ = (x₂, y₂): ψ(p·P′)/p ≡ ((x₂ − x₁)/p)·(y₂ − y₁)⁻¹ (mod p).'),
      field('(x₂ − x₁)/p', String(t.psiP.xDiffOverP)),
      field('y₂ − y₁ mod p', String(t.psiP.yDiff)),
      claim(`${idPrefix}-psiP`, 'ψ(p·P′)/p mod p', String(t.psiP.psiOverP), { raw: String(t.psiP.psiOverP) })),
    h('div', {},
      field('A = (p − 1)·Q′ mod p²', pointText(t.psiQ.A)),
      claim(`${idPrefix}-opsQ`, 'Curve operations spent', String(t.psiQ.ops), { raw: String(t.psiQ.ops) })),
    h('div', {},
      field('(x₂ − x₁)/p', String(t.psiQ.xDiffOverP)),
      field('y₂ − y₁ mod p', String(t.psiQ.yDiff)),
      claim(`${idPrefix}-psiQ`, 'ψ(p·Q′)/p mod p', String(t.psiQ.psiOverP), { raw: String(t.psiQ.psiOverP) })),
    h('div', {},
      h('p', {}, 'ψ is a homomorphism and Q′ ≡ m·P′ up to the part ψ ignores, so ψ(p·Q′) = m·ψ(p·P′): one division modulo p.'),
      claim(`${idPrefix}-m`, `m = ψ(p·Q′)/ψ(p·P′) = ${t.psiQ.psiOverP} · ${t.psiP.psiOverP}⁻¹ mod ${p}`, String(m), { raw: String(m) })),
    h('div', {},
      h('p', {}, 'The attack is finished and has produced a NUMBER. Whether it is the logarithm is decided by a separate module that multiplies P by it on the original curve modulo p and compares both coordinates with Q. Both sides are shown; neither is asserted.'),
      h('div', { class: 'both-sides' },
        field(`${m}·P, recomputed by the independent checker`, pointText(computed)),
        field('Q, as given to the attacker', pointText(Q)),
        h('p', { class: 'both-sides-eq' }, verified ? 'The two points are identical in both coordinates.' : 'The two points differ.')),
      verified
        ? verdict(markerId, 'alarm', `RECOVERED m = ${m} — VERIFIED ${m}·P = Q on the original curve`,
            h('p', { class: 'verdict-detail' }, 'The curve is broken: the secret came out of two lifts and one division.'),
            claim(`${idPrefix}-ops`, 'Curve operations the attack used (both multiplications by p − 1)', String(t.ops), { raw: String(t.ops) }),
            claim(`${idPrefix}-sqrt`, `Operations a generic square-root method needs for a group of order ${p} (2⌈√p⌉)`, String(t.sqrtOps), { raw: String(t.sqrtOps) }))
        : verdict(markerId, 'fail', `NO LOGARITHM FOUND — the candidate ${m} does not satisfy m·P = Q`,
            `The independent check computed ${pointText(computed)}, not Q. The attack’s number is reported as wrong, never as the answer.`)),
  ];
  const labels = ['PRECONDITION', 'LIFT P', 'LIFT Q', '(p−1)·P′ MOD p²', 'ψ FOR P', '(p−1)·Q′ MOD p²', 'ψ FOR Q', 'DIVIDE', 'INDEPENDENT CHECK'];
  return stepper(idPrefix, lines, labels);
}
