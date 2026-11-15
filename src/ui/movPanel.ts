/**
 * Exhibit 4 — The MOV reduction, stepped.
 *
 * Reduced Tate pairing with the distortion map φ(x, y) = (−x, i·y) on
 * y² = x³ + x, p ≡ 3 (mod 4). The attacker receives (p, n, P, R); the verdict
 * is the independent verifier's.
 */
import { movAttack } from '../attack/mov';
import type { MillerRow } from '../attack/pairing';
import { verifyLogarithm } from '../check/verify';
import { mul, type Point } from '../ec/curve';
import type { Fp2Field } from '../ec/fp2';
import { MOV_INSTANCES, TWO_TORSION_POINT, type MovInstance } from '../data/published';
import { randomScalar } from '../secret/random';
import { button, claim, controls, field, group, h, nonGoal, note, panelIntro, row, stepper, verdict } from './dom';
import { pointText } from './format';
import { resultSlot } from './retire';

type Mode = 'published' | 'fresh' | 'outside';

export function renderMovPanel(root: HTMLElement): void {
  root.append(
    panelIntro(
      '4 · The MOV reduction, stepped',
      'A pairing takes two points on the curve and returns a number in a finite field, and it does so bilinearly: pairing m·P against a fixed point gives the m-th power of pairing P against it. So a logarithm on the curve becomes a logarithm in the field. The 1991 reduction by Menezes, Okamoto and Vanstone noticed that for supersingular curves the field is tiny — a quadratic extension — and finite fields have fast logarithm algorithms that curves lack.',
      'Pick an instance. Each step shows a real value: the distorted point, the Miller loop filling in, the final exponentiation, α and β as elements a + b·i, the baby-step giant-step search in F_{p²}, and then the independent check l·P = R back on the curve.',
    ),
  );

  let instance: MovInstance = MOV_INSTANCES[0];
  let mode: Mode = 'published';
  const key = (): string => `${instance.bits}|${mode}`;

  const sizeButtons = MOV_INSTANCES.map((inst) =>
    h('label', { class: 'radio' },
      h('input', { type: 'radio', name: 'mov-size', value: String(inst.bits), id: `mov-size-${inst.bits}`, checked: inst === instance,
        onchange: () => { instance = inst; slot.sync(key()); } }),
      ` n of ${inst.bits} bits`),
  );
  const modeButtons = (['published', 'fresh', 'outside'] as const).map((m) =>
    h('label', { class: 'radio' },
      h('input', { type: 'radio', name: 'mov-mode', value: m, id: `mov-mode-${m}`, checked: m === mode,
        onchange: () => { mode = m; slot.sync(key()); } }),
      m === 'published' ? ' R from the published instance' : m === 'fresh' ? ' R = l·P for a fresh random secret l' : ' R outside the subgroup (the 2-torsion point)'),
  );
  const run = button('Run the reduction', { id: 'mov-run', primary: true, onclick: () => compute() });

  root.append(
    controls(
      group('Instance size', ...sizeButtons),
      group('Target point R', ...modeButtons),
      row(run),
    ),
  );

  const slot = resultSlot(root, 'The reduction output was retired because the instance or the target changed. Run again.');

  root.append(
    nonGoal('the Weil pairing of the 1991 paper. This page computes the reduced Tate pairing with a distortion map on one supersingular family — the usual modern presentation, needing less machinery. The transfer it demonstrates is the same.'),
    nonGoal('index calculus or any sub-exponential finite-field logarithm. The search in F_{p²} below is baby-step giant-step, which costs the same ~2√n as it would on the curve. At these sizes the transfer buys nothing; it mattered because F_{p²} admits index calculus and the number field sieve, which are named here and not built.'),
    nonGoal('supersingular curves with embedding degree other than 2 (over F_p with p ≥ 5 there are none; over extension fields there are), and ordinary curves with small k, such as MNT curves.'),
  );

  function compute(): void {
    const out = h('div', { class: 'output' });
    const { p, n, P } = instance;
    const weierstrass = { p, a2: 0n, a4: 1n, a6: 0n };
    let R: Point;
    let drawn: bigint | null = null;
    if (mode === 'published') R = instance.R;
    else if (mode === 'outside') R = TWO_TORSION_POINT;
    else {
      drawn = randomScalar(n);
      R = mul(weierstrass, drawn, P).point;
    }
    const result = movAttack({ curve: { p, a4: 1n }, n, P, R });
    out.append(
      field('Curve', `y² = x³ + x over F_${p} (p ≡ 3 mod 4, so #E = p + 1 = ${p + 1n} by the supersingularity theorem; n·P = O is checked below, not assumed)`),
      field('Subgroup order n (prime, n | p + 1)', `${n}   (cofactor (p + 1)/n = ${(p + 1n) / n})`),
      field('P', pointText(P)),
      field('R', pointText(R)),
    );
    if (!result.ok) {
      out.append(verdict('mov-result', 'fail', 'REFUSED — the MOV exhibit does not apply', result.reason));
      slot.show(out, key());
      return;
    }
    const { trace, candidate } = result;
    const F = trace.field;
    const check = candidate === null ? null : verifyLogarithm(weierstrass, P, R, candidate);
    const verified = check !== null && check.ok;

    const millerList = (rows: MillerRow[], label: string, id: string): HTMLElement =>
      h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': label },
        h('ol', { class: 'miller-rows', role: 'list', 'data-claim': id, 'data-value': String(rows.length) },
          ...rows.map((r) => h('li', { role: 'listitem' },
            h('span', { class: 'miller-kind' }, r.kind === 'double' ? 'double' : 'add'),
            h('code', {}, `f = ${F.format(r.f)}`),
            h('span', { class: 'miller-T' }, r.T === null ? 'T = O' : `T = (${r.T.x.a}, ${r.T.y.a})`)))));

    const lines: HTMLElement[] = [
      h('div', {},
        h('p', {}, 'Every precondition is checked, not assumed:'),
        field('p prime (Miller–Rabin), p ≡ 3 (mod 4)', `${p} ≡ ${p % 4n} (mod 4)`),
        field('n prime, n | p + 1', `${p + 1n} = ${n} · ${(p + 1n) / n}`),
        field('n·P = O (P has order exactly n)', 'holds')),
      h('div', {},
        h('p', {}, 'The distortion map φ(x, y) = (−x, i·y) sends P to a point of order n that is NOT an F_p-multiple of P, which is what makes the pairing of P with it non-trivial.'),
        field('φ(P) in E(F_{p²})', `(${F.format(trace.phi!.x)}, ${F.format(trace.phi!.y)})`)),
      h('div', {},
        h('p', {}, `Miller’s loop over the ${n.toString(2).length} bits of n: square f and multiply by the tangent-over-vertical at each doubling, multiply by the chord-over-vertical at each set bit, always evaluated at φ(P). The running multiple T ends at n·P = O.`),
        claim('mov-miller-rows', 'Rows in the loop for P', String(trace.alpha.miller.rows.length), { raw: String(trace.alpha.miller.rows.length) }),
        millerList(trace.alpha.miller.rows, 'Miller loop for f_{n,P}(φ(P))', 'mov-miller-list'),
        field('f_{n,P}(φ(P)) before the final exponentiation', F.format(trace.alpha.miller.f))),
      h('div', {},
        h('p', {}, 'Raise to (p² − 1)/n. This kills every factor in F_p (the verticals among them) and leaves an n-th root of unity.'),
        field('Exponent (p² − 1)/n', String(trace.alpha.exponent)),
        claim('mov-alpha', 'α = t(P, φ(P))', F.format(trace.alpha.value), { raw: F.key(trace.alpha.value) }),
        field('α^n', F.format(F.pow(trace.alpha.value, n))),
        field('α ≠ 1', F.isOne(trace.alpha.value) ? 'FAILS' : 'holds')),
      h('div', {},
        h('p', {}, 'The same Miller loop for R, against the same φ(P). Bilinearity says β = α^l when R = l·P.'),
        h('details', { class: 'disclosure' }, h('summary', {}, `Show the ${trace.beta.miller.rows.length} rows of the loop for R`),
          millerList(trace.beta.miller.rows, 'Miller loop for f_{n,R}(φ(P))', 'mov-miller-list-R')),
        claim('mov-beta', 'β = t(R, φ(P))', F.format(trace.beta.value), { raw: F.key(trace.beta.value) })),
      h('div', {},
        h('p', {}, `Baby-step giant-step in the order-${n} subgroup of F_{p²}*: tabulate α^j for j < m = ⌈√n⌉, then walk β·α^(−m·i) until it lands in the table.`),
        claim('mov-m', 'm = ⌈√n⌉', String(trace.search.m), { raw: String(trace.search.m) }),
        claim('mov-baby', 'Baby steps stored', String(trace.search.babySteps), { raw: String(trace.search.babySteps) }),
        claim('mov-giant', 'Giant steps taken', String(trace.search.giantSteps), { raw: String(trace.search.giantSteps) }),
        claim('mov-l', 'Field logarithm l with α^l = β', candidate === null ? 'none found' : String(candidate), { raw: candidate === null ? 'none' : String(candidate) })),
      h('div', {},
        h('p', {}, 'The reduction has produced a NUMBER in the field. Whether it is the logarithm on the curve is decided by an independent scalar multiplication of P, compared with R in both coordinates.'),
        candidate === null ? null : field(`${candidate}·P recomputed independently`, pointText(check!.computed)),
        verified
          ? verdict('mov-result', 'alarm', `RECOVERED l = ${candidate} — VERIFIED ${candidate}·P = R on the curve`,
              h('p', { class: 'verdict-detail' }, drawn === null ? 'The curve’s logarithm was solved in F_{p²}.' : `The freshly drawn secret was ${drawn}; the attacker never saw it.`),
              claim('mov-steps', 'Group operations the field search used (baby + giant steps)', String(trace.search.babySteps + trace.search.giantSteps), { raw: String(trace.search.babySteps + trace.search.giantSteps) }),
              claim('mov-sqrt', `Operations a square-root method needs on the curve itself (2⌈√n⌉)`, String(trace.sqrtOps), { raw: String(trace.sqrtOps) }),
              h('p', { class: 'verdict-detail' }, 'Honesty: at this size the two numbers are the same order of magnitude. The reduction bought nothing here. It mattered because F_{p²} admits sub-exponential algorithms (index calculus, the number field sieve) that no curve group does — algorithms this page names and does not run.'))
          : verdict('mov-result', 'fail', 'NO LOGARITHM EXISTS — R is not a multiple of P',
              candidate === null
                ? 'The field search found no l with α^l = β: β is not in the subgroup α generates, which happens exactly when R is not in the subgroup P generates.'
                : `The field search returned ${candidate}, but ${candidate}·P ≠ R on the curve. A number that fails the independent check is reported as no logarithm, never as the answer.`)),
    ];
    const labels = ['PRECONDITIONS', 'DISTORT', 'MILLER LOOP', 'FINAL EXPONENTIATION → α', 'β', 'BSGS IN F_{p²}', 'INDEPENDENT CHECK'];
    out.append(stepper('mov', lines, labels).element);
    slot.show(out, key());
  }

  root.append(note('info', 'The three instances were generated for this lab; no publication prints them. They are self-certifying: the test suite asserts l·P = R by scalar multiplication, which uses no pairing code.'));
  compute();
}

export type { Fp2Field };
