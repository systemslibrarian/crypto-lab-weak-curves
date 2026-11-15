/**
 * Exhibit 6 — Valid, and broken. The negative-claim exhibit (§4.1d).
 *
 * Every ordinary validation check passes, each as its own verdict; the two
 * weakness checks of exhibit 5 are deliberately NOT in the list and the page
 * says so. Then one press draws a real secret, breaks it, and the independent
 * verifier confirms the break.
 */
import { smartAttack } from '../attack/smart';
import { verifyLogarithm } from '../check/verify';
import { countPoints, factorOrder, orderOfPoint, type PointCount } from '../ec/count';
import { discriminant, formatCurve, isOnCurve, mul, type Curve, type Point } from '../ec/curve';
import { isProbablePrime } from '../ec/field';
import { MONNERAT_2002 } from '../data/published';
import { randomPoint, randomScalar } from '../secret/random';
import { button, claim, controls, field, group, h, nonGoal, note, panelIntro, row, verdict } from './dom';
import { pointText } from './format';
import { resultSlot } from './retire';
import { buildStepper } from './smartPanel';
import { onFoundCurve, type FoundCurve } from './store';

export const NEGATIVE_CLAIM =
  'Passing parameter validation — a prime field, a non-singular curve, a base point on the curve, a prime-order subgroup — does not make the discrete logarithm hard.';

export function renderBrokenPanel(root: HTMLElement): void {
  root.append(
    panelIntro(
      '6 · Valid, and broken',
      'Here is the whole lesson in one panel. A curve is put through the ordinary validation checklist — the kind every library runs before it trusts a set of parameters — and passes every line. Then you press one button.',
      'The two cheap checks from exhibit 5 are missing from the list on purpose. Ordinary validity checks do not include them; that is exactly why the standards had to add them.',
    ),
  );

  let choice: 'monnerat' | 'found' = 'monnerat';
  let found: FoundCurve | null = null;
  const key = (): string => (choice === 'found' && found ? `found|${found.curve.a4}|${found.curve.a6}|${found.curve.p}` : 'monnerat');

  const foundRadio = h('input', { type: 'radio', name: 'broken-curve', value: 'found', id: 'broken-found', disabled: true,
    onchange: () => { choice = 'found'; slot.sync(key()); render(); } }) as HTMLInputElement;
  const monnerratRadio = h('input', { type: 'radio', name: 'broken-curve', value: 'monnerat', id: 'broken-monnerat', checked: true,
    onchange: () => { choice = 'monnerat'; slot.sync(key()); render(); } }) as HTMLInputElement;
  const foundLabel = h('span', {}, ' the curve you found in exhibit 3 (none yet)');
  const breakBtn = button('Break it', { id: 'broken-break', primary: true, onclick: () => breakIt() });

  root.append(
    controls(
      group('Which curve',
        h('label', { class: 'radio' }, monnerratRadio, ` ${MONNERAT_2002.title} — ${formatCurve(MONNERAT_2002.curve)}`),
        h('label', { class: 'radio' }, foundRadio, foundLabel)),
      row(breakBtn),
    ),
  );

  const validation = h('div', { class: 'output', id: 'broken-validation' });
  root.append(validation);
  const slot = resultSlot(root, 'The break was retired because the curve changed. Press Break it again.');

  root.append(
    nonGoal('a claim that any deployed curve is weak. The curve here is a toy anomalous curve; the lesson is about which checks are and are not in a validation list.'),
    nonGoal('invalid-curve and twist attacks, which defeat validation in a different way (by feeding a point that is not on this curve at all). See the related demos.'),
  );

  let current: { curve: Curve; count: PointCount; P: Point } | null = null;

  function render(): void {
    validation.replaceChildren();
    let curve: Curve;
    let count: PointCount;
    let P: Point;
    if (choice === 'found' && found) {
      curve = found.curve;
      count = found.count;
      P = randomPoint(curve);
    } else {
      curve = MONNERAT_2002.curve;
      const counted = countPoints(curve);
      if (!counted.ok) throw new Error(counted.detail);
      count = counted.count;
      P = MONNERAT_2002.P;
    }
    current = { curve, count, P };
    const factors = factorOrder(count);
    const orderP = orderOfPoint(curve, P, count.order, factors);
    const primeP = isProbablePrime(curve.p);
    const disc = discriminant(curve);
    const onCurve = isOnCurve(curve, P);
    const primeOrder = isProbablePrime(orderP);
    const nP = mul(curve, orderP, P).point;

    validation.append(
      h('h3', {}, 'Validation checklist'),
      field('Curve', `${formatCurve(curve)} over F_${curve.p}`),
      field('Base point P', pointText(P)),
      verdict('valid-prime', primeP ? 'pass' : 'fail', primeP ? `p = ${curve.p} is prime` : `p = ${curve.p} is NOT prime`, 'Miller–Rabin with twelve bases: deterministic at this size.'),
      verdict('valid-nonsingular', disc !== 0n ? 'pass' : 'fail', disc !== 0n ? 'The curve is non-singular' : 'The curve is SINGULAR', `Discriminant of the cubic mod p: ${disc} ≠ 0.`),
      verdict('valid-oncurve', onCurve ? 'pass' : 'fail', onCurve ? 'P is on the curve' : 'P is NOT on the curve', `y² ≡ x³ + a₂x² + a₄x + a₆ (mod p) checked with the coordinates above.`),
      verdict('valid-order', primeOrder && nP === null ? 'pass' : 'fail',
        primeOrder && nP === null ? `P generates a subgroup of prime order n = ${orderP}, and n·P = O` : 'The subgroup order is NOT prime',
        `#E = ${count.order}; the order of P divides it and equals ${orderP}.`),
      note('caveat', h('strong', {}, 'Not on this list, on purpose: '), 'n ≠ p and the embedding-degree check (exhibit 5). Ordinary validity checks do not include them — and this curve fails the first one.'),
    );
  }

  function breakIt(): void {
    if (!current) return;
    const { curve, count, P } = current;
    const out = h('div', { class: 'output' });
    const attacker = (Q: Point) => smartAttack(curve, P, Q, count);
    const secret = randomScalar(curve.p);
    const Q = mul(curve, secret, P).point;
    const result = attacker(Q);
    out.append(h('h3', {}, 'Break it'), field('Q = m·P for a secret m drawn with crypto.getRandomValues', pointText(Q)));
    if (!result.ok) {
      out.append(verdict('broken-headline', 'fail', 'THE ATTACK WAS REFUSED', result.reason));
      slot.show(out, key());
      return;
    }
    const check = verifyLogarithm(curve, P, Q, result.candidate);
    if (!check.ok) {
      out.append(verdict('broken-headline', 'fail', 'NO LOGARITHM FOUND — the candidate failed the independent check', `The attack returned ${result.candidate}, and ${result.candidate}·P ≠ Q.`));
      slot.show(out, key());
      return;
    }
    // 'broken-step', not 'broken': the stepper derives its claim ids from this
    // prefix, so 'broken' made its `-m`, `-ops` and `-sqrt` claims collide with
    // the three the headline verdict below carries under the same names — two
    // elements per marker id, which is a marker that cannot be audited.
    const steps = buildStepper(result.trace, curve.p, Q, true, check.computed, count.order, 'broken-step', 'broken-attack');
    out.append(
      verdict('broken-headline', 'alarm', 'VALID CURVE, PRIME ORDER — AND BROKEN',
        h('p', { class: 'verdict-detail' }, `Every check above still reads as a pass. The secret m was recovered and independently verified: m·P = Q.`),
        claim('broken-m', 'Recovered m (verified)', String(result.candidate), { raw: String(result.candidate) }),
        claim('broken-ops', 'Curve operations the attack used', String(result.trace.ops), { raw: String(result.trace.ops) }),
        claim('broken-sqrt', `Operations a sound curve of this size would need (2⌈√p⌉)`, String(result.trace.sqrtOps), { raw: String(result.trace.sqrtOps) }),
        h('p', { class: 'negative-claim', id: 'negative-claim' }, NEGATIVE_CLAIM)),
      h('details', { class: 'disclosure' }, h('summary', {}, 'Show the attack steps'), steps.element),
      note('info', `The drawn secret was ${secret}.`),
    );
    steps.revealAll();
    slot.show(out, key());
  }

  // Registered LAST, and that ordering is load-bearing: `onFoundCurve` invokes
  // its listener immediately with the current value, the listener calls
  // `render()`, and `render()` assigns `current` — which is declared with `let`
  // above. Registering before that declaration put the call inside its temporal
  // dead zone, so the panel threw while rendering and painted no verdicts at
  // all. This also replaces the bare first render, which the listener now does.
  onFoundCurve((f) => {
    found = f;
    foundRadio.disabled = f === null;
    foundLabel.textContent = f
      ? ` the curve you found in exhibit 3: ${formatCurve(f.curve)} over F_${f.curve.p}`
      : ' the curve you found in exhibit 3 (none yet)';
    if (f === null && choice === 'found') {
      choice = 'monnerat';
      monnerratRadio.checked = true;
    }
    slot.sync(key());
    render();
  });
}
