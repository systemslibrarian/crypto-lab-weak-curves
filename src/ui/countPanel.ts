/**
 * Exhibit 1 — Count the points.
 *
 * Everything shown is computed from the four coefficients and p the reader
 * typed: #E by enumeration, the trace, the factorisation, the largest prime
 * factor n and its embedding degree up to a bound B. The classification is
 * read off those numbers, never off a preset name.
 */
import {
  classify,
  countPoints,
  embeddingDegree,
  embeddingDegreeRows,
  ENUMERATION_CAP,
  factorOrder,
  largestPrimeFactor,
} from '../ec/count';
import { formatCurve, validateCurve } from '../ec/curve';
import { formatFactorisation } from '../ec/field';
import { MONNERAT_2002, SMART_1999 } from '../data/published';
import { randomCurve, randomPrime } from '../secret/random';
import { appendAll, button, claim, controls, field, group, h, integerInput, nonGoal, note, panelIntro, row, verdict } from './dom';
import { parseInteger } from './format';
import { resultSlot } from './retire';

export function renderCountPanel(root: HTMLElement): void {
  root.append(
    panelIntro(
      '1 · Count the points',
      'An elliptic curve over a prime field is a finite set of points, and that set is a group: you can add two points and get a third. Cryptography on the curve rests on one hope — that given a point P and a multiple Q = m·P, recovering m is hopeless. How many points the curve has turns out to decide whether that hope is justified.',
      'Pick a prime p and the coefficients of y² = x³ + a₂x² + a₄x + a₆, and this exhibit counts the points one x at a time. It reports #E, the trace t = p + 1 − #E, the largest prime factor n of #E, and the embedding degree: the smallest k with p^k ≡ 1 (mod n). Two values of these numbers make the curve worthless, and the next exhibits show why.',
    ),
  );

  const p = integerInput('count-p', 'Prime p', '43', { help: `An odd prime, at most ${ENUMERATION_CAP} (the count is by enumeration).`, width: 'narrow' });
  const a2 = integerInput('count-a2', 'a₂', '39', { width: 'narrow' });
  const a4 = integerInput('count-a4', 'a₄', '1', { width: 'narrow' });
  const a6 = integerInput('count-a6', 'a₆', '41', { width: 'narrow' });
  const bound = integerInput('count-B', 'Embedding-degree bound B', '20', { help: 'k is searched for 1 ≤ k ≤ B; past B the page says "greater than B", never a number.', width: 'narrow' });
  const inputs = [p.input, a2.input, a4.input, a6.input, bound.input];
  const key = (): string => inputs.map((i) => i.value.trim()).join('|');

  const set = (pv: bigint, a2v: bigint, a4v: bigint, a6v: bigint): void => {
    p.input.value = String(pv);
    a2.input.value = String(a2v);
    a4.input.value = String(a4v);
    a6.input.value = String(a6v);
    slot.sync(key());
  };

  const presets = group(
    'Preset curves',
    button("Smart's curve (p = 43)", { onclick: () => set(43n, 39n, 1n, 41n) }),
    button("Monnerat's curve (p = 1019)", { onclick: () => set(1019n, 0n, 373n, 837n) }),
    button('Supersingular y² = x³ + x (p = 1019)', { onclick: () => set(1019n, 0n, 1n, 0n) }),
    button('Random curve', {
      id: 'count-random',
      onclick: () => {
        const prime = randomPrime(5n, 2000n);
        const c = randomCurve(prime);
        set(prime, 0n, c.a4, c.a6);
      },
    }),
  );

  const run = button('Count the points', { id: 'count-run', primary: true, onclick: () => compute() });

  root.append(
    controls(
      h('p', { class: 'control-label' }, 'The curve'),
      row(p.control, a2.control, a4.control, a6.control),
      bound.control,
      presets,
      row(run),
    ),
  );

  const slot = resultSlot(root, 'The count was retired because the curve or the bound changed. Count again to recompute.');
  for (const input of inputs) input.addEventListener('input', () => slot.sync(key()));

  root.append(
    nonGoal('point counting at cryptographic sizes. Real curves have ~2²⁵⁶ points and are counted with Schoof’s algorithm (or built with a known order by complex multiplication); here p is capped so the count stays an enumeration you can read.'),
  );

  function compute(): void {
    const out = h('div', { class: 'output' });
    const values = inputs.map((i) => parseInteger(i.value));
    if (values.some((v) => v === null)) {
      out.append(verdict('count-class', 'fail', 'REFUSED — every field must be a non-negative integer', 'Decimal digits, or 0x-prefixed hex.'));
      slot.show(out, key());
      return;
    }
    const [pv, a2v, a4v, a6v, Bv] = values as bigint[];
    if (Bv < 1n || Bv > 10_000n) {
      out.append(verdict('count-class', 'fail', 'REFUSED — B must be between 1 and 10000'));
      slot.show(out, key());
      return;
    }
    const validated = validateCurve(pv, a2v, a4v, a6v);
    if (!validated.ok) {
      out.append(verdict('count-class', 'fail', `REFUSED — ${validated.reason === 'singular' ? 'singular curve' : validated.reason === 'p-not-prime' ? 'p is not prime' : 'p too small'}`, validated.detail));
      slot.show(out, key());
      return;
    }
    const counted = countPoints(validated.curve);
    if (!counted.ok) {
      out.append(verdict('count-class', 'fail', 'REFUSED — p above the enumeration cap', counted.detail));
      slot.show(out, key());
      return;
    }
    const { count } = counted;
    const factors = factorOrder(count);
    const n = largestPrimeFactor(factors);
    const B = Number(Bv);
    const kind = classify(count);

    out.append(
      field('Curve', `${formatCurve(validated.curve)} over F_${pv}`),
      claim('count-order', '#E(F_p), including the point at infinity', String(count.order), { raw: String(count.order) }),
      claim('count-trace', 'Trace t = p + 1 − #E', String(count.trace), { raw: String(count.trace) }),
      claim('count-factors', 'Factorisation of #E', formatFactorisation(factors)),
      claim('count-n', 'Largest prime factor n of #E', String(n), { raw: String(n) }),
    );

    let kText: string;
    let kFound = false;
    if (n === 1n) {
      kText = 'undefined (#E = 1)';
    } else if (n === pv) {
      kText = `none: n = p, so p^k ≡ 0 (mod n) for every k — an anomalous curve has no embedding degree`;
    } else {
      const k = embeddingDegree(pv, n, B);
      kFound = k.found;
      kText = k.found ? `k = ${k.k}` : `greater than B = ${B}`;
      const rows = embeddingDegreeRows(pv, n, B);
      const table = h(
        'table',
        { class: 'rows-table' },
        h('caption', {}, `p^k mod n for k = 1, 2, … (stops at the first 1, or at B)`),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'k'), h('th', { scope: 'col' }, `p^k mod ${n}`))),
        h('tbody', {}, ...rows.slice(0, 12).map((r) => h('tr', {}, h('td', {}, String(r.k)), h('td', {}, String(r.residue))))),
      );
      appendAll(
        out,
        claim('count-k', `Embedding degree of the order-${n} subgroup`, kText, { raw: k.found ? String(k.k) : `>${B}` }),
        rows.length > 12 ? h('p', { class: 'help' }, `First 12 of ${rows.length} rows shown.`) : null,
        table,
      );
    }
    if (n === pv || n === 1n) out.append(claim('count-k', `Embedding degree of the order-${n} subgroup`, kText, { raw: 'none' }));

    if (kind === 'anomalous') {
      out.append(
        verdict('count-class', 'alarm', `ANOMALOUS — #E = p = ${pv}`,
          'The trace is 1. Every point has order p, the group is cyclic of prime order, and Smart’s attack (exhibit 2) recovers any logarithm in O(log p) curve operations.'),
      );
    } else if (kind === 'supersingular') {
      out.append(
        verdict('count-class', 'alarm', `SUPERSINGULAR — t = 0, #E = p + 1 = ${count.order}`,
          `Because #E = p + 1 divides p² − 1, every prime-order subgroup has embedding degree at most 2 (here ${kText}): the MOV reduction (exhibit 4) moves its logarithm into F_{p²}.`),
      );
    } else if (kFound) {
      out.append(
        verdict('count-class', 'alarm', `NEITHER ANOMALOUS NOR SUPERSINGULAR — but ${kText} ≤ B`,
          `t = ${count.trace}. The order-${n} subgroup embeds into F_{p^k}, so its logarithm transfers to a finite field. At this toy size that is expected; the point of B is that a real curve must have no such k below 100.`),
      );
    } else {
      out.append(
        verdict('count-class', 'pass', `NEITHER — t = ${count.trace}, and no k ≤ ${B} with p^k ≡ 1 (mod ${n})`,
          'This curve passes both cheap checks at this bound. That rules out the two attacks on this page; it proves nothing else about the curve.'),
      );
    }
    slot.show(out, key());
  }

  root.append(note('info', 'Sources for the preset curves: ', SMART_1999.source, '; ', MONNERAT_2002.source, '.'));
  compute();
}
