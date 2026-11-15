import { expect, test, type Page } from '@playwright/test';
import { boot, openTab } from './gate';
import { expectVerdict, readClaim, renderedMarkers } from './verdict-audit';

/**
 * The claims suite: what this lab's interface SAYS, as opposed to what it is
 * shaped like (§4.1b). A failure here says "claims", which is what actually
 * changed — the accessibility gate is not the place for a copy edit to report
 * itself.
 *
 * THE RULE THAT MAKES THESE WORTH ANYTHING: compare two values the page itself
 * printed, or recompute a claim from the page's raw inputs BY A DIFFERENT ROUTE
 * than the source takes. A test that re-derives the same expression the source
 * uses will happily agree with a bug.
 *
 * Internal consistency alone is not enough either — a page can be consistently
 * wrong — so the independent re-derivations below carry their own curve
 * arithmetic, written out here rather than imported from `src/`. It is the
 * right-to-left ladder with a different inversion routine from either module in
 * the source, so a defect in the shared arithmetic cannot make the page and
 * this suite agree by construction.
 */

// ── Independent arithmetic, deliberately not imported from src/ ────────────

function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

/** Inverse by Fermat's little theorem — a different route from the source's extended Euclid. */
function inv(a: bigint, p: bigint): bigint {
  let result = 1n;
  let base = mod(a, p);
  let e = p - 2n;
  while (e > 0n) {
    if (e & 1n) result = (result * base) % p;
    base = (base * base) % p;
    e >>= 1n;
  }
  return result;
}

interface Pt {
  x: bigint;
  y: bigint;
}

function addPt(P: Pt | null, Q: Pt | null, a2: bigint, a4: bigint, p: bigint): Pt | null {
  if (P === null) return Q;
  if (Q === null) return P;
  let lambda: bigint;
  if (P.x === Q.x) {
    if (mod(P.y + Q.y, p) === 0n) return null;
    lambda = mod((3n * P.x * P.x + 2n * a2 * P.x + a4) * inv(2n * P.y, p), p);
  } else {
    lambda = mod((Q.y - P.y) * inv(Q.x - P.x, p), p);
  }
  const x = mod(lambda * lambda - a2 - P.x - Q.x, p);
  return { x, y: mod(lambda * (P.x - x) - P.y, p) };
}

function mulPt(k: bigint, P: Pt | null, a2: bigint, a4: bigint, p: bigint): Pt | null {
  let result: Pt | null = null;
  let addend = P;
  while (k > 0n) {
    if (k & 1n) result = addPt(result, addend, a2, a4, p);
    addend = addPt(addend, addend, a2, a4, p);
    k >>= 1n;
  }
  return result;
}

/**
 * The curve operations a left-to-right double-and-add spends on k·P: one
 * doubling per bit below the top bit, plus one addition per set bit among
 * those. Derived from the algorithm, not read from the source's counter.
 */
function doubleAndAddOps(k: bigint): number {
  const bits = k.toString(2);
  return bits.length - 1 + bits.slice(1).split('').filter((b) => b === '1').length;
}

/** 2⌈√n⌉ — what a generic square-root method costs in a group of order n. */
function sqrtOps(n: bigint): bigint {
  let root = 0n;
  while ((root + 1n) * (root + 1n) <= n) root += 1n;
  return 2n * (root * root === n ? root : root + 1n);
}

function powMod(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n % m;
  let base = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * base) % m;
    base = (base * base) % m;
    e >>= 1n;
  }
  return r;
}

// ── Reading the page ───────────────────────────────────────────────────────

async function inputValue(page: Page, selector: string): Promise<bigint> {
  const raw = await page.locator(selector).inputValue();
  return BigInt(raw.trim());
}

async function claimValue(page: Page, id: string): Promise<bigint> {
  const claim = await readClaim(page, id);
  expect(claim.value, `claim "${id}" carries no data-value`).not.toBeNull();
  return BigInt(claim.value as string);
}

test.describe('displayed claims', () => {
  test('the arrival classification names the curve the page counted, and #E = p + 1 − t on screen', async ({ page }) => {
    await boot(page);
    // The headline claim, recomputed from values the page printed, not from a
    // sentence typed here: the order, the trace and p must satisfy the
    // definition of the trace of Frobenius.
    const p = await inputValue(page, '#count-p');
    const order = await claimValue(page, 'count-order');
    const trace = await claimValue(page, 'count-trace');
    expect(order).toBe(p + 1n - trace);
    // And the classification follows from those numbers: trace 1 is anomalous.
    expect(trace).toBe(1n);
    await expectVerdict(page, 'count-class', { text: `ANOMALOUS — #E = p = ${p}`, tone: 'alarm' });
  });

  test('the point count is right: an independent count of the same curve agrees with the number on screen', async ({ page }) => {
    await boot(page);
    const [p, a2, a4, a6] = await Promise.all(
      ['#count-p', '#count-a2', '#count-a4', '#count-a6'].map((s) => inputValue(page, s)),
    );
    // Counted by Euler's criterion rather than by the page's residue table.
    let count = 1n;
    for (let x = 0n; x < p; x++) {
      const f = mod(x * x * x + a2 * x * x + a4 * x + a6, p);
      if (f === 0n) count += 1n;
      else if (powMod(f, (p - 1n) / 2n, p) === 1n) count += 2n;
    }
    expect(await claimValue(page, 'count-order')).toBe(count);
  });

  test('the displayed embedding degree is the SMALLEST k with p^k ≡ 1 (mod n), recomputed from the printed p and n', async ({ page }) => {
    await boot(page);
    // The supersingular preset: n | p + 1, so k = 2 and the page must say so.
    await page.getByRole('button', { name: /Supersingular/ }).click();
    await page.locator('#count-run').click();
    await expect(page.locator('[data-verdict="count-class"]')).toBeVisible();
    const p = await inputValue(page, '#count-p');
    const n = await claimValue(page, 'count-n');
    const k = await claimValue(page, 'count-k');
    expect(powMod(p, k, n)).toBe(1n);
    for (let smaller = 1n; smaller < k; smaller++) {
      expect(powMod(p, smaller, n), `k = ${smaller} would also work, so ${k} is not the smallest`).not.toBe(1n);
    }
    await expectVerdict(page, 'count-class', { text: /SUPERSINGULAR/, tone: 'alarm' });
  });

  test('the p^k table rendered has one row per exponent up to the k the page reports', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: /Supersingular/ }).click();
    await page.locator('#count-run').click();
    const k = await claimValue(page, 'count-k');
    // A cross-check between two surfaces: the reported k and the rows counted.
    await expect(page.locator('#panel-count .rows-table tbody tr')).toHaveCount(Number(k));
  });

  test("Smart's recovered scalar really is the logarithm: m·P = Q, recomputed from the page's own inputs", async ({ page }) => {
    await boot(page);
    await openTab(page, /Smart's attack/, '#panel-smart');
    await page.locator('#smart-all').click();
    const [p, a2, a4, px, py, qx, qy] = await Promise.all(
      ['#smart-p', '#smart-a2', '#smart-a4', '#smart-px', '#smart-py', '#smart-qx', '#smart-qy'].map((s) =>
        inputValue(page, s),
      ),
    );
    const m = await claimValue(page, 'smart-m');
    const computed = mulPt(m, { x: px, y: py }, a2, a4, p);
    expect(computed, 'm·P must not be the point at infinity here').not.toBeNull();
    expect(computed!.x).toBe(qx);
    expect(computed!.y).toBe(qy);
    await expectVerdict(page, 'smart-result', {
      text: `RECOVERED m = ${m} — VERIFIED ${m}·P = Q on the original curve`,
      tone: 'alarm',
    });
  });

  test("Smart's two ψ values and the division agree: m · ψ(pP′) ≡ ψ(pQ′) (mod p)", async ({ page }) => {
    await boot(page);
    await openTab(page, /Smart's attack/, '#panel-smart');
    await page.locator('#smart-all').click();
    const p = await inputValue(page, '#smart-p');
    const psiP = await claimValue(page, 'smart-psiP');
    const psiQ = await claimValue(page, 'smart-psiQ');
    const m = await claimValue(page, 'smart-m');
    // Parts sum to whole: the quotient the page printed must reproduce the
    // numerator from the denominator.
    expect(mod(m * psiP, p)).toBe(psiQ);
  });

  test('the lift digit on screen really lifts: (y + t·p)² ≡ f(x) (mod p²)', async ({ page }) => {
    await boot(page);
    await openTab(page, /Smart's attack/, '#panel-smart');
    await page.locator('#smart-all').click();
    const [p, a2, a4, a6, px, py] = await Promise.all(
      ['#smart-p', '#smart-a2', '#smart-a4', '#smart-a6', '#smart-px', '#smart-py'].map((s) => inputValue(page, s)),
    );
    const t = await claimValue(page, 'smart-liftP');
    const p2 = p * p;
    const lifted = py + t * p;
    expect(mod(lifted * lifted, p2)).toBe(mod(px * px * px + a2 * px * px + a4 * px + a6, p2));
  });

  test("Smart's cost claim is a measurement: both counts are re-derived here from p alone", async ({ page }) => {
    await boot(page);
    await openTab(page, /Smart's attack/, '#panel-smart');
    await page.locator('#smart-all').click();
    const p = await inputValue(page, '#smart-p');
    const opsP = await claimValue(page, 'smart-opsP');
    const opsQ = await claimValue(page, 'smart-opsQ');
    const total = await claimValue(page, 'smart-ops');

    // Each ψ step is one multiplication by p − 1 modulo p², so the page's own
    // counter must equal what double-and-add spends on that scalar.
    const perMultiplication = BigInt(doubleAndAddOps(p - 1n));
    expect(opsP).toBe(perMultiplication);
    expect(opsQ).toBe(perMultiplication);
    expect(total).toBe(opsP + opsQ);
    expect(await claimValue(page, 'smart-sqrt')).toBe(sqrtOps(p));

    // The claim the page is entitled to make is that the cost is linear in
    // log p — two scalar multiplications, each at most two operations per bit.
    // NOT that it beats the square-root figure at this size: at p = 43 the two
    // numbers are equal, which is why the page prints both and compares nothing.
    expect(Number(total)).toBeLessThanOrEqual(4 * p.toString(2).length);
  });

  test("Smart's attack names the actual cause when it refuses a curve that is not anomalous", async ({ page }) => {
    await boot(page);
    await openTab(page, /Smart's attack/, '#panel-smart');
    await page.locator('#smart-preset-refused').click();
    await page.locator('#smart-run').click();
    // The refusal must name the counted order and p, not merely say "refused".
    await expectVerdict(page, 'smart-result', { text: '#E = 48 but p = 43', tone: 'fail' });
    await expect(page.locator('[data-verdict="smart-result"]')).toContainText('not anomalous');
  });

  test('a point off the curve is refused by name', async ({ page }) => {
    await boot(page);
    await openTab(page, /Smart's attack/, '#panel-smart');
    await page.locator('#smart-py').fill('15');
    await page.locator('#smart-run').click();
    await expectVerdict(page, 'smart-result', { text: 'is not on the curve', tone: 'fail' });
  });

  test('the MOV reduction recovers a logarithm that checks out on the curve, recomputed here', async ({ page }) => {
    await boot(page);
    await openTab(page, /MOV reduction/, '#panel-mov');
    await page.locator('#mov-all').click();
    const l = await claimValue(page, 'mov-l');
    // p, n, P and R are printed in the output; read them back out of the text
    // the page rendered rather than from a fixture.
    const panel = page.locator('#panel-mov');
    const curveLine = (await panel.locator('.field', { hasText: 'Curve' }).first().textContent()) ?? '';
    const p = BigInt((curveLine.match(/over F_(\d+)/) ?? [])[1] ?? '0');
    const pointText = async (label: string): Promise<Pt> => {
      const text = (await panel.locator('.field').filter({ hasText: new RegExp(`^${label}`) }).first().textContent()) ?? '';
      const m = text.match(/\((\d+), (\d+)\)/);
      expect(m, `could not read point ${label} from "${text}"`).not.toBeNull();
      return { x: BigInt(m![1]), y: BigInt(m![2]) };
    };
    const P = await pointText('P');
    const R = await pointText('R');
    const computed = mulPt(l, P, 0n, 1n, p);
    expect(computed).not.toBeNull();
    expect(computed!.x).toBe(R.x);
    expect(computed!.y).toBe(R.y);
    await expectVerdict(page, 'mov-result', { text: `RECOVERED l = ${l} — VERIFIED ${l}·P = R on the curve`, tone: 'alarm' });
  });

  test('the Miller-loop row count on screen equals the rows rendered, and matches the bit length of n', async ({ page }) => {
    await boot(page);
    await openTab(page, /MOV reduction/, '#panel-mov');
    await page.locator('#mov-all').click();
    const claimed = await claimValue(page, 'mov-miller-rows');
    // Two surfaces that must agree: the counter and the rows it counts.
    await expect(page.locator('[data-claim="mov-miller-list"] li')).toHaveCount(Number(claimed));
    // And an independent re-derivation: one row per bit of n below the top bit,
    // plus one more for every set bit among those.
    const nText = (await page.locator('#panel-mov .field').filter({ hasText: 'Subgroup order n' }).first().textContent()) ?? '';
    const n = BigInt((nText.match(/(\d{3,})/) ?? [])[1] ?? '0');
    const bits = n.toString(2);
    const expected = bits.length - 1 + bits.slice(1).split('').filter((b) => b === '1').length;
    expect(Number(claimed)).toBe(expected);
  });

  test('the baby-step count equals ⌈√n⌉ and the giant-step count stays below it', async ({ page }) => {
    await boot(page);
    await openTab(page, /MOV reduction/, '#panel-mov');
    await page.locator('#mov-all').click();
    const m = await claimValue(page, 'mov-m');
    const baby = await claimValue(page, 'mov-baby');
    const giant = await claimValue(page, 'mov-giant');
    const sqrtOps = await claimValue(page, 'mov-sqrt');
    expect(baby).toBe(m);
    expect(giant).toBeLessThan(m);
    expect(sqrtOps).toBe(2n * m);
    expect(await claimValue(page, 'mov-steps')).toBe(baby + giant);
  });

  test('the pairing values on screen satisfy β = α^l in F_{p²}, recomputed here', async ({ page }) => {
    await boot(page);
    await openTab(page, /MOV reduction/, '#panel-mov');
    await page.locator('#mov-all').click();
    const alpha = (await readClaim(page, 'mov-alpha')).value!.split(',').map(BigInt);
    const beta = (await readClaim(page, 'mov-beta')).value!.split(',').map(BigInt);
    const l = await claimValue(page, 'mov-l');
    const curveLine = (await page.locator('#panel-mov .field', { hasText: 'Curve' }).first().textContent()) ?? '';
    const p = BigInt((curveLine.match(/over F_(\d+)/) ?? [])[1] ?? '0');
    // F_p[i]/(i²+1) multiplication, written out here.
    const mul2 = (x: bigint[], y: bigint[]): bigint[] => [
      mod(x[0] * y[0] - x[1] * y[1], p),
      mod(x[0] * y[1] + x[1] * y[0], p),
    ];
    let acc = [1n, 0n];
    let base = alpha;
    let e = l;
    while (e > 0n) {
      if (e & 1n) acc = mul2(acc, base);
      base = mul2(base, base);
      e >>= 1n;
    }
    expect(acc).toEqual(beta);
  });

  test('a target outside the subgroup is reported as no logarithm, never as a number', async ({ page }) => {
    await boot(page);
    await openTab(page, /MOV reduction/, '#panel-mov');
    await page.locator('#mov-mode-outside').check();
    await page.locator('#mov-run').click();
    await page.locator('#mov-all').click();
    await expectVerdict(page, 'mov-result', { text: 'NO LOGARITHM EXISTS — R is not a multiple of P', tone: 'fail' });
  });

  test('exhibit 5 recomputes: P-256 and secp256k1 pass both checks, and every failing curve names which check failed', async ({ page }) => {
    await boot(page);
    await openTab(page, /Is this curve weak/, '#panel-weak');
    await expectVerdict(page, 'weak-p256', { text: 'PASSES BOTH CHECKS (B = 99)', tone: 'pass' });
    await expectVerdict(page, 'weak-secp256k1', { text: 'PASSES BOTH CHECKS (B = 99)', tone: 'pass' });
    await expectVerdict(page, 'weak-monnerat', { text: 'FAILS CHECK 1 — n = p, the curve is anomalous', tone: 'fail' });
    await expectVerdict(page, 'weak-mov16', { text: 'FAILS CHECK 2 — embedding degree k = 2', tone: 'fail' });
    // n·G = O is computed on the page for every subject, including the two at full size.
    expect((await readClaim(page, 'weak-p256-nG')).text).toContain('O (point at infinity)');
    expect((await readClaim(page, 'weak-secp256k1-nG')).text).toContain('O (point at infinity)');
  });

  test('the bound the page uses is the standard clause it quotes', async ({ page }) => {
    await boot(page);
    await openTab(page, /Is this curve weak/, '#panel-weak');
    // The hand-authored quotation, the B the control carries, and the B the
    // verdict reports are three surfaces that must agree.
    await expect(page.locator('#panel-weak .help').first()).toContainText('1 ≤ B < 100');
    await expect(page.locator('#weak-B')).toHaveValue('99');
    await expectVerdict(page, 'weak-p256', { text: 'B = 99', tone: 'pass' });
  });
});

test.describe('evidence lifecycle', () => {
  test('changing the curve retires the stale count and says it was retired', async ({ page }) => {
    await boot(page);
    await expect(page.locator('[data-verdict="count-class"]')).toBeVisible();
    await page.locator('#count-a6').fill('40');
    await expect(page.locator('#panel-count .evidence-retired')).toContainText('retired');
    await expect(page.locator('[data-verdict="count-class"]')).toHaveCount(0);
  });

  test('the no-op guard: retyping the same value does NOT retire a fresh result', async ({ page }) => {
    await boot(page);
    const before = await claimValue(page, 'count-order');
    const same = await page.locator('#count-a6').inputValue();
    await page.locator('#count-a6').fill(same);
    await expect(page.locator('#panel-count .evidence-retired')).toHaveCount(0);
    await expect(page.locator('[data-verdict="count-class"]')).toBeVisible();
    expect(await claimValue(page, 'count-order')).toBe(before);
  });

  test('the MOV output retires when the instance changes', async ({ page }) => {
    await boot(page);
    await openTab(page, /MOV reduction/, '#panel-mov');
    await page.locator('#mov-all').click();
    await expect(page.locator('[data-verdict="mov-result"]')).toBeVisible();
    await page.locator('#mov-size-24').check();
    await expect(page.locator('#panel-mov .evidence-retired')).toContainText('retired');
    await expect(page.locator('[data-verdict="mov-result"]')).toHaveCount(0);
  });
});

test.describe('structural honesty', () => {
  test('[hidden] really hides: no class rule outranks the UA rule on a hidden panel', async ({ page }) => {
    await boot(page);
    // The trap this probes: a class rule setting `display` outranks the UA
    // `[hidden]` rule, so the element paints while the code believes it hidden.
    const leaking = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[hidden]'))
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => `${el.tagName.toLowerCase()}#${el.id}`),
    );
    expect(leaking, 'an element with [hidden] whose computed display is not none').toEqual([]);
  });

  test('no verdict word is rendered outside a verdict marker', async ({ page }) => {
    await boot(page);
    // (1) above alone is gameable: drop the marker and the verdict stops needing
    // a mutation. This is what closes that door.
    const WORDS = ['RECOVERED ', 'REFUSED ', 'ANOMALOUS', 'SUPERSINGULAR', 'NO LOGARITHM', 'PASSES BOTH', 'FAILS CHECK', 'AND BROKEN'];
    const unmarked = await page.evaluate((words) => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('main *'))) {
        if (el.closest('[data-verdict]')) continue;
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join(' ')
          .trim();
        if (!own) continue;
        const hit = words.find((w) => own.includes(w));
        if (hit) out.push(`${hit} :: ${el.tagName.toLowerCase()}.${el.className} :: ${own.slice(0, 90)}`);
      }
      return out;
    }, WORDS);
    expect(unmarked, 'verdict wording outside a [data-verdict] marker is unaudited').toEqual([]);
  });

  test('no marker id is rendered twice, in the state that carries the most of them', async ({ page }) => {
    await boot(page);
    // Exhibit 6 renders a validation checklist, a headline verdict and a full
    // attack stepper at once, and the stepper DERIVES its claim ids from a
    // prefix — so this is where a generated id collides with a hand-written
    // one. A duplicated id is a marker that cannot be audited: every helper
    // that reads it resolves two elements and can assert neither.
    await openTab(page, /Valid, and broken/, '#panel-broken');
    await page.locator('#broken-break').click();
    await expect(page.locator('[data-verdict="broken-headline"]')).toBeVisible();
    for (const family of ['verdict', 'claim'] as const) {
      const duplicated = await page.evaluate((name) => {
        const counts = new Map<string, number>();
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-${name}]`))) {
          const id = el.getAttribute(`data-${name}`) ?? '';
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        return [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`);
      }, family);
      expect(duplicated, `duplicated data-${family} ids`).toEqual([]);
    }
  });

  test('every verdict marker the arrival page renders is one this suite asserts', async ({ page }) => {
    await boot(page);
    // A declared denominator read from the DOM, not a hand-kept list: a new
    // verdict on the arrival panel fails here until it is covered.
    expect(await renderedMarkers(page, 'verdict')).toEqual(['count-class']);
  });
});

/**
 * §4.1d — the negative claim.
 *
 * Scoped to what the page checks, not to the field: passing the validation
 * checks this page performs does not make the discrete logarithm hard.
 *
 * The fixture is exhibit 6: every validation verdict reads as a pass, no
 * verdict anywhere in the panel reads as a failure, and the secret comes out
 * anyway and is independently verified.
 */
test.describe('negative claim', () => {
  const CLAIM =
    'Passing parameter validation — a prime field, a non-singular curve, a base point on the curve, a prime-order subgroup — does not make the discrete logarithm hard.';

  test('reaching the fixture through the UI leaves every check green AND the secret recovered', async ({ page }) => {
    await boot(page);
    await openTab(page, /Valid, and broken/, '#panel-broken');

    // 1. Reach the fixture.
    await page.locator('#broken-break').click();

    // 2. Everything is green — asserted against the RENDERED verdicts, not a
    //    flag this test sets. Every validation check reports success, and no
    //    verdict in the panel reports a failure at all.
    await expectVerdict(page, 'valid-prime', { text: 'is prime', tone: 'pass' });
    await expectVerdict(page, 'valid-nonsingular', { text: 'The curve is non-singular', tone: 'pass' });
    await expectVerdict(page, 'valid-oncurve', { text: 'P is on the curve', tone: 'pass' });
    await expectVerdict(page, 'valid-order', { text: 'prime order', tone: 'pass' });
    const tones = await page.locator('#panel-broken [data-verdict]').evaluateAll((els) =>
      els.map((e) => `${e.getAttribute('data-verdict')}=${e.getAttribute('data-tone')}`),
    );
    expect(tones.filter((t) => t.endsWith('=fail')), 'no check may fail in the fixture state').toEqual([]);

    // ...and the logarithm is out, verified by the independent checker.
    await expectVerdict(page, 'broken-headline', { text: 'VALID CURVE, PRIME ORDER — AND BROKEN', tone: 'alarm' });
    await expectVerdict(page, 'broken-attack', { text: 'VERIFIED', tone: 'alarm' });

    // 3. The limitation is ON SCREEN in that state — visible, not in the README
    //    and not behind a disclosure the reader has to open.
    const claim = page.locator('#negative-claim');
    await expect(claim).toBeVisible();
    await expect(claim).toHaveText(CLAIM);
  });

  test('the recovered secret in the fixture is real: m·P = Q, recomputed from the printed points', async ({ page }) => {
    await boot(page);
    await openTab(page, /Valid, and broken/, '#panel-broken');
    await page.locator('#broken-break').click();
    const m = await claimValue(page, 'broken-m');
    const panel = page.locator('#panel-broken');
    const read = async (label: RegExp): Promise<Pt> => {
      const text = (await panel.locator('.field').filter({ hasText: label }).first().textContent()) ?? '';
      const found = text.match(/\((\d+), (\d+)\)/);
      expect(found, `could not read a point from "${text}"`).not.toBeNull();
      return { x: BigInt(found![1]), y: BigInt(found![2]) };
    };
    const P = await read(/^Base point P/);
    const Q = await read(/^Q = m·P/);
    const curveText = (await panel.locator('.field').filter({ hasText: /^Curve/ }).first().textContent()) ?? '';
    const p = BigInt((curveText.match(/over F_(\d+)/) ?? [])[1] ?? '0');
    const a4 = BigInt((curveText.match(/\+ (\d+)x(?! ?²)/) ?? [])[1] ?? '0');
    const a6 = BigInt((curveText.match(/\+ (\d+)\s*$/m) ?? [])[1] ?? '0');
    expect(p).toBeGreaterThan(0n);
    const computed = mulPt(m, P, 0n, a4, p);
    expect(computed, `m·P with a4 = ${a4}, a6 = ${a6}`).not.toBeNull();
    expect(computed!.x).toBe(Q.x);
    expect(computed!.y).toBe(Q.y);
  });

  test('the cost claim beside the fixture is a measurement re-derived from the printed curve', async ({ page }) => {
    await boot(page);
    await openTab(page, /Valid, and broken/, '#panel-broken');
    await page.locator('#broken-break').click();
    const panel = page.locator('#panel-broken');
    const curveText = (await panel.locator('.field').filter({ hasText: /^Curve/ }).first().textContent()) ?? '';
    const p = BigInt((curveText.match(/over F_(\d+)/) ?? [])[1] ?? '0');
    expect(p).toBeGreaterThan(0n);
    // Two multiplications by p − 1, and the generic figure for a group of order p.
    expect(await claimValue(page, 'broken-ops')).toBe(2n * BigInt(doubleAndAddOps(p - 1n)));
    expect(await claimValue(page, 'broken-sqrt')).toBe(sqrtOps(p));
  });
});
