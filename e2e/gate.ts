import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditControlNames, formatControlNameFailures } from './control-names';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Five rules govern everything here, each correcting a defect in the gate this
 * one descends from:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. Pushing
 *     `animation:none!important` through `addStyleTag` BYPASSES this lab's own
 *     `@media (prefers-reduced-motion: reduce)` block instead of exercising it,
 *     so the rendering a reduced-motion reader actually gets — `.panel` and
 *     every `.reveal` stepper line with their animations cancelled by the
 *     stylesheet's own rule — would never be the rendering scanned. This gate
 *     sets the preference through `emulateMedia`, asserts from inside the page
 *     that it took effect, and injects nothing.
 *
 *  2. NO PANEL IS REVEALED FROM SCRIPT. Stripping `[hidden]` would put all six
 *     tabpanels on screen at once — a rendering no reader can reach — and
 *     script-opening a `<details>` means the shut state, which is what every
 *     reader arrives at, is never scanned. This gate clicks the real tabs and
 *     opens each disclosure through its `<summary>`, and scans before and after.
 *
 *  3. THE DRIVE NAMES EVERY CONTROL IT TOUCHES and waits on a real completion
 *     signal after each — a verdict marker appearing, a step counter, an
 *     `aria-selected` flip — never a fixed timeout. A click that silently did
 *     nothing must not look like one that worked.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. Every surface carrying
 *     this lab's meaning is a `color-mix()` fill axe files under `incomplete`
 *     rather than judging: all four verdict tones, the danger/caveat callouts
 *     and the hero aside, plus the shared top bar's `color-mix()` ink.
 *
 *  5. THERE IS A REFLOW, NON-TEXT-CONTRAST AND GENERATED-CONTENT ORACLE.
 *     `nontext.ts` measures every control boundary as painted, at every driven
 *     state; `expectNoHorizontalOverflow` adds the 1.4.10 check axe has no rule
 *     for — which matters here because this lab paints 64-hex-digit named-curve
 *     parameters, 20-digit pairing values and a Miller-loop scroll region.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough: a transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will report it. Transitions drain in
 * waves, so a poll for "nothing running right now" can exit through a gap
 * between waves — hence six consecutive quiet frames.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * infinite animations are excluded rather than waited on, a wall-clock budget
 * inside the page gives up and proceeds, and Playwright's timeout is the
 * backstop. Under the reduced motion this gate asserts, `style.css` cancels
 * `.panel` / `.reveal` and every transition, so this normally returns on the
 * sixth frame; it stays because the shared top bar's `.cl-btn` transitions are
 * declared OUTSIDE the lab's `@media` block.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' },
  );
}

/**
 * Assert that reduced motion left the page VISIBLE, not merely un-animated.
 *
 * The failure this guards against is an element whose only route to its visible
 * state is an animation, in a stylesheet whose reduced-motion block cancels
 * that animation without restoring its end state — the element then renders at
 * `opacity: 0` for every reader with the preference set. This lab has exactly
 * that shape: `@keyframes fade` and `@keyframes reveal` both start at
 * `opacity: 0`, and every tabpanel and every stepper line rides one of them.
 * The reduced-motion block cancels both with `animation: none`, which restores
 * the static `opacity: 1` — correct today, and this is what makes that a
 * measurement rather than a reading of the stylesheet.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from page creation.
 *
 * Every panel here renders synchronously at first activation and most of them
 * run real arithmetic while rendering, so a thrown `NonInvertibleError` or a
 * refused precondition that escapes leaves that tabpanel EMPTY — and an empty
 * region is exactly what a scan reports as perfectly accessible.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * The shared `.cl-topbar` carries an explicit `role="banner"`. This lab's hero
 * is a `<div class="cl-hero">`, not a `<header>`, so nothing here implies a
 * second banner today — but the bar's own `dedupeBanner()` exists because other
 * labs did ship one, and the hero is the part of this page most likely to be
 * re-templated from a lab that uses `<header>`. Asserting the OUTCOME rather
 * than the markup is what catches that edit.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false;
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * List semantics survive their styling.
 *
 * This lab has three lists that matter: the stepper's `ol.step-list`, the
 * Miller-loop `ol.miller-rows`, each styled `list-style: none` — the exact
 * declaration that makes Safari and VoiceOver DROP the implicit list role — so
 * both carry an explicit `role="list"` with `role="listitem"` children. What is
 * asserted is the SHAPE of that fix: any explicit role on a `ul`/`ol` must be
 * `list` (any other value orphans every `<li>` under it), and a `role="list"`
 * must never sit on an empty element, because axe applies
 * `aria-required-children` to the explicit role and fails it the day a stepper
 * renders with no steps. Roles are assigned in an element-creation helper, so
 * ask the DOM rather than grepping the source.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els
      .filter((e) => e.getAttribute('role') !== 'list' || e.children.length === 0)
      .map((e) => `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] with ${e.children.length} children`),
  );
  expect(
    broken,
    'an explicit non-list role on a list deletes its semantics; an empty role="list" fails aria-required-children',
  ).toEqual([]);
}

/**
 * Load the page with reduced motion actually in effect, and assert the content
 * every scan relies on is really there — including the lab's DEFAULTS.
 *
 * SHARED SETUP RUNS BEFORE EVERY TEST THAT IMPORTS IT, so an assertion here
 * fails all of them at once, under whatever name those tests carry. THEREFORE
 * THIS FUNCTION ASSERTS STRUCTURE AND NEVER PRODUCT COPY (§4.1a). A sentence
 * asserted here would make a copy edit report itself as an accessibility
 * failure; what a string SAYS belongs in `claims.spec.ts`, where a failure
 * names copy as the subject.
 *
 * Structure means: the control exists; the arrival panel is the one that ships;
 * counts; `[hidden]`/`toBeEmpty()` on the five lazily-rendered panels; a
 * default matching a SHAPE (`/^\d+$/`), never a particular number.
 *
 * The defaults are asserted at length because `main.ts` renders each tabpanel
 * lazily on first activation and the counting panel computes a real point count
 * at mount. A navigation that resolves proves nothing: a renderer that threw
 * would leave `#panel-count` empty, and an empty region scans clean.
 */
export async function boot(page: Page): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the whole
  // test timeout and reports nothing useful.
  page.setDefaultTimeout(30_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect',
  ).toBe(true);

  // Dark is the only theme, pinned with a literal before first paint.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await assertSingleBanner(page);
  await assertListSemantics(page);

  // ── The page really rendered ───────────────────────────────────────────
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.tab-btn')).toHaveCount(6);

  // The shared skip link points at an id that exists. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it — a skip link
  // aimed at a missing element is exactly what a green axe run says nothing about.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#app')).toHaveCount(1);

  // Dark is the only theme, so the page carries no theme control at all. The
  // shared CSS hides any lab toggle with `display:none !important`, which would
  // leave a dead-but-known element; asserting the count at zero catches the day
  // one is added without going through that list.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, .theme-toggle-btn, [data-theme-toggle]'),
  ).toHaveCount(0);

  // ── The arrival state: exhibit 1 active and ALREADY COUNTED ────────────
  // `renderCountPanel` counts its default curve at mount, so first paint carries
  // a real classification verdict rather than a placeholder. WHAT that verdict
  // says is a claim and belongs in claims.spec.ts.
  await expect(page.getByRole('tab', { name: /Count the points/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-count [data-verdict="count-class"]')).toBeVisible();
  await expect(page.locator('#panel-count [data-claim="count-order"]')).toBeVisible();
  for (const id of ['smart', 'find', 'mov', 'weak', 'broken']) {
    await expect(page.locator(`#panel-${id}`)).toBeHidden();
    await expect(page.locator(`#panel-${id}`)).toBeEmpty();
  }

  // ── Every shipped control default, as a SHAPE ──────────────────────────
  for (const id of ['#count-p', '#count-a2', '#count-a4', '#count-a6', '#count-B']) {
    await expect(page.locator(id)).toHaveValue(/^\d+$/);
  }
  // Disclosures ship shut.
  await expect(page.locator('#app details[open]')).toHaveCount(0);

  await settle(page);
  await expectNotBlank(page, 'first paint');
}

/**
 * Assert the page does not require horizontal scrolling (WCAG 1.4.10, AA).
 * axe has no rule for this at all.
 *
 * This lab's long values are the real risk: 64-hex-digit P-256 and secp256k1
 * parameters, 11-digit coordinates in the 32-bit MOV instance, and pairing
 * values printed as `a + b·i`. Every one of them relies on
 * `overflow-wrap: anywhere` in `.field-value` rather than a scroll region, and
 * the Miller-loop list is the one deliberate scroller. At 380px a new unwrapped
 * `<code>` run is precisely what this catches.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;
    // Only elements that push the DOCUMENT sideways are culprits. A wide box
    // inside an `overflow: auto` wrapper has a huge rect but is clipped by its
    // scroller and contributes nothing — naming it sends you to the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };
    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"` so arrow keys can
 * scroll it.
 *
 * This lab HAS such a scroller and it is load-bearing: the Miller-loop region
 * in exhibit 4 is `overflow: auto` with a capped height, holds no focusable
 * content, and would be unreachable without the `tabindex="0"` and
 * `role="region"` it is built with. This assertion is what keeps that a
 * measurement. It fails on the Linux CI runner even where it passes locally.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()} (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`);
  });
  expect(Array.from(new Set(unreachable)), `scrolling regions with no keyboard route in state: ${label}`).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps its
 * tab index, so a keyboard reader lands on a control that is not on screen.
 * `display: none` and `visibility: hidden` DO remove an element from the tab
 * order, so those are skipped — the failure is the invisible-but-tabbable pair.
 * The five hidden tabpanels here take the `display: none` route, which is why
 * their buttons are legitimately absent from the tab order.
 *
 * Off-screen-but-focusable is the WCAG-sanctioned skip-link idiom and is
 * deliberately not flagged: the shared skip link parks at `top:-3rem` at full
 * opacity. The drive scans it focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) effective *= parseFloat(getComputedStyle(n).opacity);
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()} (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`,
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing, so
 * one run enumerates every defect instead of one run per defect. It is a
 * debugging aid only: it is never set in CI, and `reportCollected` fails the
 * test at the end, so a green collection run cannot be mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no
 * text node.
 *
 * IT IS CALLED FROM `scan()`, deliberately — not from inside a soft wrapper
 * after its `if (!COLLECTING) return` guard, which elsewhere in this fleet meant
 * the oracle never executed in any strict run, which is every run in CI.
 *
 * It ratchets: anything NOT in the baseline fails, anything in the baseline that
 * got WORSE fails, and anything in it that has been FIXED fails until the entry
 * is deleted. That last rule is what stops an allowlist becoming an exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    else if (f.ratio < base.ratio - 0.01) problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/** Fail if a baselined finding never appeared: it has been fixed (delete it) or the drive stopped reaching its state. */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)',
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands. Nine assertions, because axe's
 * `violations` array alone is not a complete oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. Only `color-contrast` is allowed to remain there, and
 *    only because the next assertion computes those ratios arithmetically —
 *    which matters here because every surface carrying this lab's meaning is a
 *    `color-mix()` fill: all four verdict tones, the danger and caveat
 *    callouts, the hero aside, and the shared bar's ink. Everything else in
 *    that bucket is a real result axe could not finish, including
 *    `aria-prohibited-attr`, where an `aria-label` on a role-less element
 *    hides. This page leans on getting that right: the preset rows, the
 *    instance-size radios and the target-point radios are all `role="group"`
 *    carrying their label.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - the same walk over `aria-hidden` content with the exemption lifted — this
 *    lab hides the four verdict glyphs (✓ ✕ ⚠ ℹ), each painted in a semantic
 *    ink on a `color-mix()` tint, so they are measured for real.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);

  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `.withRules()` both write `options.runOnly`, so
  // the second call SILENTLY REPLACES the first. Chained, axe runs those four
  // best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass.
  //
  // The landmark four are wanted because they are best-practice rather than
  // WCAG-tagged, so `withTags` alone does not reach them — and this page has
  // the shape they catch: a sticky `<header role="banner">` above a
  // `<div id="app">` holding an `<aside class="cl-hero-why">`, two `<nav>`s,
  // one `<main>` and a footer.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules(['landmark-no-duplicate-banner', 'landmark-unique', 'landmark-one-main', 'landmark-complementary-is-top-level'])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({ state: label, id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8) }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  // axe's `label` rule accepts a bare `placeholder` as an accessible name, so a
  // deleted label can leave this gate green. See `control-names.ts`.
  const unnamed = formatControlNameFailures(await auditControlNames(page));
  softExpect(unnamed, `form controls named only by placeholder/title in state: ${label}`, []);

  // The aria-hidden walk, exemption lifted — axe skips this text entirely and
  // the default walk honours the same boundary, so this second call is the ONLY
  // thing that ever measures the verdict glyphs.
  const hiddenContrast = Array.from(
    new Set(formatContrastFailures(await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true))),
  );
  softExpect(hiddenContrast, `measured aria-hidden contrast failures in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

// ── The drive ───────────────────────────────────────────────────────────────

/** Switch to a tab by clicking it, and prove the switch happened. */
export async function openTab(page: Page, name: RegExp, panelId: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(panelId)).toBeVisible();
  await expect(page.locator(panelId)).not.toBeEmpty();
}

/** Step a stepper to its last step through the real control, and prove it got there. */
async function stepToEnd(page: Page, prefix: string): Promise<void> {
  const next = page.locator(`#${prefix}-next`);
  const progress = page.locator(`#panel-${prefix === 'smart' ? 'smart' : prefix} .step-progress`).first();
  const text = (await progress.textContent()) ?? '';
  const total = Number(text.split('/')[1]?.trim() ?? '0');
  expect(total, `stepper ${prefix} reports a total`).toBeGreaterThan(1);
  for (let i = 2; i <= total; i++) {
    await next.click();
    await expect(progress).toHaveText(`Step ${i} / ${total}`);
  }
  await expect(next).toBeDisabled();
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Five things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, exactly as a reader gets it: exhibit 1
 *    active and already counted, five panels hidden and unrendered, every
 *    disclosure shut.
 *
 *  - EVERY PANEL IS RENDERED LAZILY, so a tab never clicked is a panel never in
 *    the DOM. Each of the six is activated through its real tab button.
 *
 *  - EVERY REFUSAL STATE. This lab's fail-closed paths are the teaching: a
 *    composite p, a singular curve, a point off the curve, a non-anomalous
 *    curve handed to Smart's attack, a target outside the subgroup handed to
 *    the MOV reduction. None is reachable without typing something wrong on
 *    purpose, and each paints a `fail` verdict the scan must see.
 *
 *  - HOVER IS A STATE, AND IT PERSISTS AFTER A CLICK. `:hover` stays on the
 *    element under the pointer after `page.click()` resolves, so it is the state
 *    a reader occupies the instant after pressing a button — and `.tab-btn:hover`
 *    and `.cl-btn:hover` both repaint their fill.
 *
 *  - NO FIXED TIMEOUTS. Every wait is on a real DOM completion signal.
 */
export async function driveAllStates(page: Page, label: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${label} / ${s}`);

  await scanAt('arrival: exhibit 1 counted, five panels unrendered, disclosures shut');

  // ── The shared skip link, focused ──────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('the shared skip link focused, slid in from top:-3rem');

  // ── Exhibit 1 · Count the points ───────────────────────────────────────
  await page.getByRole('button', { name: /Supersingular/ }).click();
  await page.locator('#count-run').click();
  await expect(page.locator('[data-verdict="count-class"]')).toHaveAttribute('data-tone', 'alarm');
  await scanAt('Count: a supersingular curve classified, with its p^k table');

  await page.getByRole('button', { name: /Random curve/ }).click();
  await page.locator('#count-run').click();
  await expect(page.locator('[data-verdict="count-class"]')).toBeVisible();
  await scanAt('Count: a randomly drawn curve');

  // A composite modulus: the refusal path, which is a fail verdict, not a throw.
  await page.locator('#count-p').fill('1849');
  await expect(page.locator('.evidence-retired')).toBeVisible();
  await scanAt('Count: the result retired because an input changed');
  await page.locator('#count-run').click();
  await expect(page.locator('[data-verdict="count-class"]')).toHaveAttribute('data-tone', 'fail');
  await scanAt('Count: composite p refused');

  // A singular curve: y² = x³ has a cusp.
  await page.locator('#count-p').fill('1019');
  await page.locator('#count-a2').fill('0');
  await page.locator('#count-a4').fill('0');
  await page.locator('#count-a6').fill('0');
  await page.locator('#count-run').click();
  await expect(page.locator('[data-verdict="count-class"]')).toHaveAttribute('data-tone', 'fail');
  await scanAt('Count: singular curve refused');

  // Back to a curve that passes both checks at this bound, for the pass tone.
  await page.locator('#count-p').fill('1009');
  await page.locator('#count-a4').fill('7');
  await page.locator('#count-a6').fill('11');
  await page.locator('#count-B').fill('2');
  await page.locator('#count-run').click();
  await expect(page.locator('[data-verdict="count-class"]')).toBeVisible();
  await scanAt('Count: a curve judged against a small bound B');

  // ── Exhibit 2 · Smart's attack ─────────────────────────────────────────
  await openTab(page, /Smart's attack/, '#panel-smart');
  await expect(page.locator('#panel-smart .step-progress')).toHaveText(/Step 1 \/ 9/);
  await scanAt("Smart: the published example at step 1, Back disabled");

  await page.locator('#smart-next').click();
  await expect(page.locator('#panel-smart .step-progress')).toHaveText('Step 2 / 9');
  await scanAt('Smart: stepped once, the lift revealed');

  await page.locator('#smart-all').click();
  await expect(page.locator('[data-verdict="smart-result"]')).toBeVisible();
  await expect(page.locator('#smart-next')).toBeDisabled();
  await scanAt("Smart: every step shown, the recovered logarithm verified");

  await page.locator('#smart-preset-monnerat').click();
  await page.locator('#smart-run').click();
  await stepToEnd(page, 'smart');
  await expect(page.locator('[data-verdict="smart-result"]')).toHaveAttribute('data-tone', 'alarm');
  await scanAt("Smart: Monnerat's example recovered and verified");

  await page.locator('#smart-preset-refused').click();
  await page.locator('#smart-run').click();
  await expect(page.locator('[data-verdict="smart-result"]')).toHaveAttribute('data-tone', 'fail');
  await scanAt('Smart: a non-anomalous curve refused, with the counted reason');

  // A point that is not on the curve: the other refusal shape.
  await page.locator('#smart-preset-smart').click();
  await page.locator('#smart-py').fill('15');
  await page.locator('#smart-run').click();
  await expect(page.locator('[data-verdict="smart-result"]')).toHaveAttribute('data-tone', 'fail');
  await scanAt('Smart: a point off the curve refused');

  // ── Exhibit 3 · Find your own anomalous curve ──────────────────────────
  await openTab(page, /Find an anomalous curve/, '#panel-find');
  await expect(page.locator('#find-break')).toBeDisabled();
  await scanAt('Find: arrival, with Break disabled until a curve is found');

  await page.locator('#find-search').click();
  await expect(page.locator('[data-verdict="find-search"]')).toHaveAttribute('data-tone', 'alarm');
  await expect(page.locator('#find-break')).toBeEnabled();
  await scanAt('Find: an anomalous curve found by search');

  await page.locator('#find-break').click();
  await expect(page.locator('[data-verdict="find-result"]')).toHaveAttribute('data-tone', 'alarm');
  await scanAt('Find: a freshly drawn secret recovered and verified');

  await page.locator('#find-p').fill('1848');
  await page.locator('#find-search').click();
  await expect(page.locator('[data-verdict="find-search"]')).toHaveAttribute('data-tone', 'fail');
  await scanAt('Find: a composite p refused');

  // ── Exhibit 4 · The MOV reduction ──────────────────────────────────────
  await openTab(page, /MOV reduction/, '#panel-mov');
  await expect(page.locator('#panel-mov .step-progress')).toHaveText(/Step 1 \/ 7/);
  await scanAt('MOV: the 16-bit instance at step 1');

  await page.locator('#mov-all').click();
  await expect(page.locator('[data-verdict="mov-result"]')).toHaveAttribute('data-tone', 'alarm');
  await scanAt('MOV: every step shown, the logarithm recovered through F_{p²}');

  // The Miller-loop scroll region, focused: the one scroller on the page.
  await page.locator('#panel-mov .table-wrap').first().focus();
  await scanAt('MOV: the Miller-loop scroll region focused');

  await page.locator('#panel-mov details.disclosure > summary').first().click();
  await expect(page.locator('#panel-mov details[open]')).toHaveCount(1);
  await scanAt("MOV: the second Miller loop's disclosure opened");

  await page.locator('#mov-mode-fresh').check();
  await page.locator('#mov-run').click();
  await page.locator('#mov-all').click();
  await expect(page.locator('[data-verdict="mov-result"]')).toHaveAttribute('data-tone', 'alarm');
  await scanAt('MOV: a freshly drawn secret recovered');

  await page.locator('#mov-mode-outside').check();
  await page.locator('#mov-run').click();
  await page.locator('#mov-all').click();
  await expect(page.locator('[data-verdict="mov-result"]')).toHaveAttribute('data-tone', 'fail');
  await scanAt('MOV: a target outside the subgroup — no logarithm exists');

  await page.locator('#mov-size-24').check();
  await page.locator('#mov-mode-published').check();
  await page.locator('#mov-run').click();
  await page.locator('#mov-all').click();
  await expect(page.locator('[data-verdict="mov-result"]')).toHaveAttribute('data-tone', 'alarm');
  await scanAt('MOV: the 24-bit instance');

  // ── Exhibit 5 · Is this curve weak? ────────────────────────────────────
  await openTab(page, /Is this curve weak/, '#panel-weak');
  await expect(page.locator('[data-verdict="weak-p256"]')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('[data-verdict="weak-monnerat"]')).toHaveAttribute('data-tone', 'fail');
  await scanAt('Weak: both named curves passing and three lab curves failing');

  await page.locator('#weak-B').fill('1');
  await page.locator('#weak-run').click();
  await expect(page.locator('[data-verdict="weak-mov16"]')).toBeVisible();
  await scanAt('Weak: the search narrowed to B = 1');

  await page.locator('#weak-B').fill('x');
  await page.locator('#weak-run').click();
  await expect(page.locator('[data-verdict="weak-bound"]')).toHaveAttribute('data-tone', 'fail');
  await scanAt('Weak: a malformed bound refused');

  // ── Exhibit 6 · Valid, and broken ──────────────────────────────────────
  await openTab(page, /Valid, and broken/, '#panel-broken');
  await expect(page.locator('[data-verdict="valid-prime"]')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('[data-verdict="valid-order"]')).toHaveAttribute('data-tone', 'pass');
  await scanAt('Broken: the validation checklist, every line passing');

  await page.locator('#broken-break').click();
  await expect(page.locator('[data-verdict="broken-headline"]')).toHaveAttribute('data-tone', 'alarm');
  await scanAt('Broken: valid and broken at once — the negative-claim state');

  await page.locator('#panel-broken details.disclosure > summary').click();
  await expect(page.locator('#panel-broken details[open]')).toHaveCount(1);
  await scanAt('Broken: the attack steps disclosed');

  // The curve found in exhibit 3 is offered here; selecting it re-renders.
  await page.locator('#broken-found').check();
  await expect(page.locator('[data-verdict="valid-prime"]')).toBeVisible();
  await page.locator('#broken-break').click();
  await expect(page.locator('[data-verdict="broken-headline"]')).toBeVisible();
  await scanAt('Broken: the curve found in exhibit 3, broken too');

  // ── Hover, which persists after a click ────────────────────────────────
  await page.getByRole('button', { name: 'Break it' }).hover();
  await scanAt('a primary button hovered');

  await page.getByRole('tab', { name: /Count the points/ }).hover();
  await scanAt('an inactive tab hovered — its surface-2 fill repainted');

  await page.locator('.cl-topbar .cl-btn').first().hover();
  await scanAt('a shared top bar control hovered');

  // ── Focus rings on the controls that take them ─────────────────────────
  await page.locator('#broken-break').focus();
  await scanAt('a primary button focused, showing its focus-visible outline');

  await page.getByRole('tab', { name: /Valid, and broken/ }).focus();
  await scanAt('the active tab focused');
}
