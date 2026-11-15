/**
 * Exhibit 3 — Find your own anomalous curve.
 *
 * Real randomness throughout: the prime, the curve search, the base point and
 * the secret all come from crypto.getRandomValues through the secret module.
 * The attacker never sees the secret; the verdict is the independent verifier's.
 */
import { smartAttack } from '../attack/smart';
import { verifyLogarithm } from '../check/verify';
import { type PointCount } from '../ec/count';
import { formatCurve, mul, type Curve, type Point } from '../ec/curve';
import { isProbablePrime } from '../ec/field';
import { findAnomalousCurve, SEARCH_PRIME_CAP } from '../ec/search';
import { randomPoint, randomPrime, randomScalar } from '../secret/random';
import { button, claim, controls, field, h, integerInput, nonGoal, note, panelIntro, row, verdict } from './dom';
import { parseInteger, pointText } from './format';
import { resultSlot } from './retire';
import { buildStepper } from './smartPanel';
import { setFoundCurve } from './store';

export function renderFindPanel(root: HTMLElement): void {
  root.append(
    panelIntro(
      '3 · Find your own anomalous curve',
      'Published examples can feel staged. Here nothing is: pick a prime (or let the page pick one), and the exhibit draws random curves over that field and counts each one until it finds a curve with exactly p points. Then it draws a random base point and a random secret, hands the attacker only the curve and the two points, and lets the independent check decide.',
      'Watch the operation counts at the end. Smart’s attack costs a handful of curve operations however large p is; a generic method costs about 2√p. At toy sizes the gap is small; at 256 bits it is the difference between a millisecond and the age of the universe.',
    ),
  );

  const p = integerInput('find-p', 'Prime p', '1019', { help: `An odd prime, at most ${SEARCH_PRIME_CAP}.`, width: 'narrow' });
  const key = (): string => p.input.value.trim();
  const randomPrimeBtn = button('Random prime', {
    id: 'find-random-prime',
    onclick: () => {
      p.input.value = String(randomPrime(101n, SEARCH_PRIME_CAP));
      slot.sync(key());
    },
  });
  const search = button('Search for an anomalous curve', { id: 'find-search', primary: true, onclick: () => runSearch() });
  const breakBtn = button('Draw a random P and secret m, then break it', { id: 'find-break', primary: true, disabled: true, onclick: () => runBreak() });

  root.append(controls(row(p.control), row(randomPrimeBtn, search, breakBtn)));

  const slot = resultSlot(root, 'The search result was retired because p changed. Search again.');
  p.input.addEventListener('input', () => {
    slot.sync(key());
    if (!slot.hasResult()) {
      found = null;
      breakBtn.disabled = true;
    }
  });

  root.append(
    nonGoal('the complex-multiplication method. That is how anomalous curves of real size are manufactured (and how the standards’ test vectors for this check were produced); the search here is by enumeration, so p stays small.'),
  );

  let found: { curve: Curve; count: PointCount } | null = null;
  let searchOut: HTMLElement | null = null;

  function runSearch(): void {
    const out = h('div', { class: 'output' });
    searchOut = out;
    found = null;
    breakBtn.disabled = true;
    const pv = parseInteger(p.input.value);
    if (pv === null || pv < 5n) {
      out.append(verdict('find-search', 'fail', 'REFUSED — p must be an integer ≥ 5'));
      slot.show(out, key());
      return;
    }
    if (!isProbablePrime(pv)) {
      out.append(verdict('find-search', 'fail', `REFUSED — p = ${pv} is not prime`, 'A composite modulus gives no field, no curve group and no attack.'));
      slot.show(out, key());
      return;
    }
    const result = findAnomalousCurve(pv);
    if (!result.ok) {
      out.append(verdict('find-search', 'fail', result.reason === 'p-above-cap' ? 'REFUSED — p above the search cap' : `NOT FOUND in ${result.attempts} curves`, result.detail));
      slot.show(out, key());
      return;
    }
    found = { curve: result.curve, count: result.count };
    setFoundCurve(found);
    breakBtn.disabled = false;
    out.append(
      claim('find-attempts', 'Random curves counted before one had exactly p points', String(result.attempts), { raw: String(result.attempts) }),
      field('The curve', `${formatCurve(result.curve)} over F_${pv}`),
      claim('find-order', '#E(F_p), by enumeration', String(result.count.order), { raw: String(result.count.order) }),
      claim('find-trace', 'Trace t', String(result.count.trace), { raw: String(result.count.trace) }),
      verdict('find-search', 'alarm', `FOUND — #E = p = ${pv}: an anomalous curve`,
        'Its group of points is cyclic of prime order p, which would pass a prime-order check. Press the next button to see what that is worth.'),
      h('div', { class: 'break-area' }),
    );
    slot.show(out, key());
  }

  function runBreak(): void {
    if (!found || !searchOut) return;
    const area = searchOut.querySelector<HTMLElement>('.break-area');
    if (!area) return;
    area.replaceChildren();
    const { curve, count } = found;
    const P = randomPoint(curve);
    // The attacker closure is complete before the secret is drawn.
    const attacker = (Q: Point) => smartAttack(curve, P, Q, count);
    const secret = randomScalar(curve.p);
    const Q = mul(curve, secret, P).point;
    const result = attacker(Q);
    area.append(
      field('Random base point P', pointText(P)),
      field('Q = m·P, for a secret m drawn with crypto.getRandomValues (the attacker is given P and Q only)', pointText(Q)),
    );
    if (!result.ok) {
      area.append(verdict('find-result', 'fail', result.kind === 'refused' ? 'REFUSED' : 'ATTACK FAILED', result.reason));
      return;
    }
    const check = verifyLogarithm(curve, P, Q, result.candidate);
    const steps = buildStepper(result.trace, curve.p, Q, check.ok, check.computed, count.order, 'find', 'find-result');
    steps.revealAll();
    area.append(
      steps.element,
      note(check.ok ? 'danger' : 'caveat',
        check.ok
          ? `The drawn secret was ${secret}; the attacker, who never saw it, returned ${result.candidate}.`
          : `The drawn secret was ${secret}; the attacker returned ${result.candidate}, which the independent check rejected.`),
    );
  }
}
