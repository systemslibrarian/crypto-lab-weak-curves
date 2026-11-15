import { expect, test } from '@playwright/test';
import { boot, driveAllStates, expectBaselineNotStale, NARROW, reportCollected, watchPageErrors } from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches: the arrival state, where
 * exhibit 1 has already counted its default curve and the other five tabpanels
 * are hidden and UNRENDERED; the shared skip link focused; a supersingular
 * curve and a randomly drawn one classified; a composite modulus and a singular
 * curve refused; Smart's attack at step 1, stepped once, and fully revealed on
 * both published examples; the same attack refused on a non-anomalous curve and
 * on a point off the curve; the search for an anomalous curve and the break
 * that follows it; the MOV reduction stepped to its verified end on two
 * instance sizes, its Miller-loop scroll region focused, its second loop's
 * disclosure opened, a freshly drawn secret, and a target outside the subgroup
 * where no logarithm exists; the two standards checks on four curves at two
 * bounds and on a malformed bound; the validation checklist with every line
 * passing and then the same curve broken; three hover states; two focus rings.
 * Every one of those states is scanned, at desktop and phone width.
 *
 * See `gate.ts` for why nothing is injected into the page, why no panel is
 * revealed from script, why the lab's defaults are asserted rather than
 * assumed, and why `violations` is not the whole oracle.
 */

test('no WCAG A/AA violations in the shipped dark theme', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchPageErrors(page);
  await boot(page);
  await driveAllStates(page, 'dark');
  expect(errors, errors.join('\n')).toEqual([]);
  expectBaselineNotStale();
  reportCollected();
});

test('no WCAG A/AA violations in the shipped dark theme at 380px', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchPageErrors(page);
  await page.setViewportSize(NARROW);
  await boot(page);
  await driveAllStates(page, 'dark @380px');
  expect(errors, errors.join('\n')).toEqual([]);
  expectBaselineNotStale();
  reportCollected();
});
