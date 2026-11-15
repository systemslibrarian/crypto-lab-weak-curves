/**
 * Exhibit 5 — Is this curve weak? The two cheap checks from SEC 1 §3.1.1.2.1
 * step 8, run live on two deployed curves at full size and on this lab's weak
 * curves. Nothing here is a literal result: n·G, n ≠ p and every p^k mod n are
 * computed when the panel renders.
 */
import { weakCurveChecks } from '../check/weak';
import { mul, type Curve } from '../ec/curve';
import { MONNERAT_2002, MOV_INSTANCES, NAMED_CURVES, SEC1_STEP_8, SMART_1999, SP800_186_C1 } from '../data/published';
import { button, claim, controls, field, h, integerInput, nonGoal, note, panelIntro, row, verdict } from './dom';
import { hex, parseInteger } from './format';
import { resultSlot } from './retire';

interface Subject {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly curve: Curve;
  readonly n: bigint;
  readonly G: { x: bigint; y: bigint } | null;
  readonly big: boolean;
}

export function renderWeakPanel(root: HTMLElement): void {
  root.append(
    panelIntro(
      '5 · Is this curve weak?',
      'The two attacks on this page are old enough that the standards wrote checks against them. SEC 1 asks a curve to pass exactly two tests: the subgroup order n must not equal p (otherwise Smart’s attack applies), and p^k must not be 1 modulo n for any small k (otherwise the MOV reduction moves the logarithm into F_{p^k}). Both are cheap. Neither is a security proof.',
      'This exhibit runs those two checks, at full size, on P-256 and secp256k1 with parameters copied from their specifications — and on the weak curves from exhibits 2 and 4, which fail them.',
    ),
  );

  const bound = integerInput('weak-B', 'Bound B for the embedding-degree search', String(SEC1_STEP_8.bound), {
    help: `SEC 1 v2.0 §3.1.1.2.1 step 8: "${SEC1_STEP_8.wording}" — so the largest exponent tested is 99. Change B to see the search go further.`,
    width: 'narrow',
  });
  const run = button('Run both checks', { id: 'weak-run', primary: true, onclick: () => compute() });
  root.append(controls(row(bound.control), row(run)));
  const slot = resultSlot(root, 'The checks were retired because B changed. Run again.');
  bound.input.addEventListener('input', () => slot.sync(bound.input.value.trim()));

  root.append(
    note('danger', h('strong', {}, 'Do not conclude anything about a deployed curve from this page beyond these two checks. '),
      'Passing them rules out exactly the two attacks shown here. It says nothing about twist security, invalid-curve attacks, side channels, or the provenance of the parameters.'),
    nonGoal('a verdict on any named curve. P-256 and secp256k1 appear only as the subjects of two arithmetic checks whose inputs are copied from SP 800-186 §3.2.1.3 and SEC 2 §2.4.1; nothing on this page claims either curve is weak.'),
    note('info', 'The same two conditions in NIST SP 800-186 Appendix C.1, criteria 4 and 5: ', h('q', {}, SP800_186_C1.wording), ' The 2^10 there is a far larger margin than SEC 1’s 100; both exclude the curves on this page.'),
  );

  const subjects: Subject[] = [
    ...NAMED_CURVES.map((c) => ({ id: c.id, name: c.name, source: c.source, curve: c.curve, n: c.n, G: c.G, big: true })),
    { id: 'smart43', name: "Smart's curve (exhibit 2)", source: SMART_1999.source, curve: SMART_1999.curve, n: 43n, G: SMART_1999.P, big: false },
    { id: 'monnerat', name: "Monnerat's curve (exhibits 2 and 6)", source: MONNERAT_2002.source, curve: MONNERAT_2002.curve, n: 1019n, G: MONNERAT_2002.P, big: false },
    { id: 'mov16', name: 'y² = x³ + x, p = 199483 (exhibit 4)', source: 'generated for this lab', curve: { p: MOV_INSTANCES[0].p, a2: 0n, a4: 1n, a6: 0n }, n: MOV_INSTANCES[0].n, G: MOV_INSTANCES[0].P, big: false },
  ];

  function compute(): void {
    const out = h('div', { class: 'output' });
    const Bv = parseInteger(bound.input.value);
    if (Bv === null || Bv < 1n || Bv > 100_000n) {
      out.append(verdict('weak-bound', 'fail', 'REFUSED — B must be an integer between 1 and 100000'));
      slot.show(out, bound.input.value.trim());
      return;
    }
    const B = Number(Bv);
    for (const s of subjects) {
      const report = weakCurveChecks(s.curve.p, s.n, B);
      const nG = s.G ? mul(s.curve, s.n, s.G).point : null;
      const card = h('section', { class: 'weak-card', 'aria-label': s.name },
        h('h3', {}, s.name),
        h('p', { class: 'help' }, `Parameters: ${s.source}`),
        field('p', s.big ? hex(s.curve.p) : String(s.curve.p)),
        field('n', s.big ? hex(s.n) : String(s.n)),
        claim(`weak-${s.id}-nG`, 'n·G computed on the curve', nG === null ? 'O (point at infinity)' : 'NOT O', { raw: nG === null ? 'O' : 'not-O' }),
        claim(`weak-${s.id}-anom`, 'Check 1: n ≠ p', report.anomalous ? `FAILS — n = p` : 'holds', { raw: report.anomalous ? 'fail' : 'pass' }),
        claim(`weak-${s.id}-k`, `Check 2: p^k ≢ 1 (mod n) for 1 ≤ k ≤ ${B}`,
          report.embedding.found ? `FAILS at k = ${report.embedding.k}` : `holds — no such k up to ${B}`,
          { raw: report.embedding.found ? String(report.embedding.k) : `>${B}` }),
      );
      if (report.passesBoth) {
        card.append(verdict(`weak-${s.id}`, 'pass', `PASSES BOTH CHECKS (B = ${B})`, 'Not anomalous, and no embedding degree up to B. That is all these two checks can say.'));
      } else if (report.anomalous) {
        card.append(verdict(`weak-${s.id}`, 'fail', 'FAILS CHECK 1 — n = p, the curve is anomalous', 'Smart’s attack applies: see exhibit 2.'));
      } else {
        card.append(verdict(`weak-${s.id}`, 'fail', `FAILS CHECK 2 — embedding degree k = ${report.embedding.found ? report.embedding.k : '?'}`, 'The logarithm transfers to F_{p^k}: see exhibit 4.'));
      }
      out.append(card);
    }
    slot.show(out, bound.input.value.trim());
  }

  compute();
}
