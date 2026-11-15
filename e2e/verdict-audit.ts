import { expect, test, type Page } from '@playwright/test';
import { record, specPath } from './observations';

/**
 * The shared helpers every recorded kill goes through. Each writes the
 * (test title, marker id) pair to the run-scoped sink at the moment it
 * executes; `global-teardown.ts` reads those back.
 *
 * `expectVerdict` asserts a marker's TEXT and its STATE as one claim, and
 * proves the state attribute is one the stylesheet paints — an attribute
 * nothing paints is a state the reader cannot see.
 */

test.afterEach(async ({}, info) => {
  record({ kind: 'ran', test: info.title, spec: specPath(info.file), attempt: info.retry, status: info.status ?? 'unknown' });
});

function observe(helper: 'expectVerdict' | 'readClaim', marker: string): void {
  const info = test.info();
  record({ kind: 'asserted', test: info.title, spec: specPath(info.file), attempt: info.retry, helper, marker });
}

export type Tone = 'pass' | 'fail' | 'alarm' | 'info';

export async function expectVerdict(page: Page, id: string, expected: { text: string | RegExp; tone: Tone }): Promise<void> {
  observe('expectVerdict', id);
  const marker = page.locator(`[data-verdict="${id}"]`);
  await expect(marker, `verdict marker "${id}" is not rendered exactly once`).toHaveCount(1);
  await expect(marker, `verdict marker "${id}" rendered the wrong text`).toContainText(expected.text);
  await expect(marker, `verdict marker "${id}" says the right words in the wrong state`).toHaveAttribute('data-tone', expected.tone);
  const painted = await marker.evaluate((element) => {
    const read = (): string => {
      const style = getComputedStyle(element);
      return `${style.backgroundColor}|${style.borderLeftColor}`;
    };
    const original = element.getAttribute('data-tone');
    const before = read();
    element.setAttribute('data-tone', original === 'alarm' ? 'pass' : 'alarm');
    const after = read();
    if (original === null) element.removeAttribute('data-tone');
    else element.setAttribute('data-tone', original);
    return before !== after;
  });
  expect(painted, `verdict marker "${id}" has a data-tone the stylesheet does not paint`).toBe(true);
}

export async function expectNoVerdict(page: Page, id: string): Promise<void> {
  await expect(page.locator(`[data-verdict="${id}"]`)).toHaveCount(0);
}

export interface Claim {
  readonly text: string;
  readonly value: string | null;
}

/** Reads a measurement marker so the caller can compare it with an INDEPENDENTLY computed expectation. */
export async function readClaim(page: Page, id: string): Promise<Claim> {
  observe('readClaim', id);
  const marker = page.locator(`[data-claim="${id}"]`);
  await expect(marker, `claim marker "${id}" is not rendered exactly once`).toHaveCount(1);
  return marker.evaluate((element) => ({
    text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    value: element.getAttribute('data-value'),
  }));
}

export async function renderedMarkers(page: Page, family: 'verdict' | 'claim'): Promise<string[]> {
  return page.evaluate((name) => {
    const attribute = `data-${name}`;
    return Array.from(new Set(Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`)).map((e) => e.getAttribute(attribute) ?? ''))).filter(Boolean).sort();
  }, family);
}
