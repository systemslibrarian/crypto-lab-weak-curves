/** Tiny, dependency-free DOM helpers shared by the panels. No innerHTML anywhere. */

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/** Hyperscript: h('button', { class: 'x', onclick: fn }, 'label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      node.className = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/**
 * `node.append` is the native DOM method and rejects null; every builder here
 * returns a nullable `Child` so a conditional row can be written inline. This
 * drops the nulls so both halves agree.
 */
export function appendAll(node: HTMLElement, ...children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/**
 * Verdict tones. Colour tracks SYSTEM INTEGRITY, not the raw outcome: a curve
 * that passes validation and is then broken is an ALARM, a refusal or a
 * mismatch is a FAIL, a check that holds is a PASS. Never colour alone — every
 * verdict carries an icon and words.
 */
export type Tone = 'pass' | 'fail' | 'alarm' | 'info';

const ICON: Record<Tone, string> = { pass: '✓', fail: '✕', alarm: '⚠', info: 'ℹ' };

/**
 * A verdict marker. `data-verdict` names it for the claims suite and the
 * mutation ledger; `data-tone` is the state the stylesheet paints.
 */
export function verdict(id: string, tone: Tone, headline: string, ...detail: Child[]): HTMLElement {
  return h(
    'div',
    { class: 'verdict', 'data-verdict': id, 'data-tone': tone, role: 'status' },
    h('span', { class: 'verdict-icon', 'aria-hidden': 'true' }, ICON[tone]),
    h(
      'div',
      { class: 'verdict-body' },
      h('strong', { class: 'verdict-headline' }, headline),
      ...detail.map((d) => (typeof d === 'string' ? h('p', { class: 'verdict-detail' }, d) : d)),
    ),
  );
}

/** A computed value the reader is invited to check. `data-claim` names it; `data-value` carries the raw number. */
export function claim(id: string, label: string, value: string, opts: { sub?: string; raw?: string } = {}): HTMLElement {
  return h(
    'div',
    { class: 'field', 'data-claim': id, 'data-value': opts.raw ?? value },
    h('span', { class: 'field-label' }, label, opts.sub ? h('span', { class: 'field-sub' }, ` ${opts.sub}`) : null),
    h('code', { class: 'field-value' }, value),
  );
}

/** A labelled read-only value with no claim marker (inputs echoed back, equations). */
export function field(label: string, value: string, opts: { mono?: boolean } = {}): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    h('code', { class: opts.mono === false ? 'field-value plain' : 'field-value' }, value),
  );
}

export function panelIntro(title: string, ...paras: (string | HTMLElement)[]): HTMLElement {
  return h(
    'div',
    { class: 'panel-intro' },
    h('h2', {}, title),
    ...paras.map((p) => (typeof p === 'string' ? h('p', {}, p) : p)),
  );
}

export function note(kind: 'info' | 'danger' | 'caveat', ...children: Child[]): HTMLElement {
  return h('p', { class: `callout callout-${kind}` }, ...children);
}

/** The one-line "what this isn't" every non-goal gets in the UI. */
export function nonGoal(text: string): HTMLElement {
  return h('p', { class: 'callout callout-info nongoal' }, h('strong', {}, 'What this isn’t: '), text);
}

/** Replaces evidence that no longer belongs to the controls currently on screen. */
export function evidenceRetired(text: string): HTMLElement {
  return h(
    'p',
    { class: 'callout callout-caveat evidence-retired', role: 'status', 'aria-live': 'polite' },
    text,
  );
}

export function button(
  label: string,
  opts: { id?: string; primary?: boolean; onclick: () => void; ariaLabel?: string; disabled?: boolean } ,
): HTMLButtonElement {
  return h(
    'button',
    {
      type: 'button',
      id: opts.id,
      class: `btn ${opts.primary ? 'btn-primary' : 'btn-ghost'}`,
      'aria-label': opts.ariaLabel,
      disabled: opts.disabled,
      onclick: opts.onclick,
    },
    label,
  ) as HTMLButtonElement;
}

/** A labelled text input for an integer (decimal; `0x` hex accepted). */
export function integerInput(
  id: string,
  label: string,
  value: string,
  opts: { help?: string; width?: 'narrow' | 'wide' } = {},
): { control: HTMLElement; input: HTMLInputElement } {
  const input = h('input', {
    id,
    class: `mono-input${opts.width === 'narrow' ? ' narrow' : ''}`,
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    spellcheck: 'false',
    value,
  }) as HTMLInputElement;
  const control = h(
    'div',
    { class: 'control' },
    h('label', { for: id }, label),
    input,
    opts.help ? h('p', { class: 'help' }, opts.help) : null,
  );
  return { control, input };
}

export function controls(...children: Child[]): HTMLElement {
  return h('div', { class: 'controls' }, ...children);
}

export function row(...children: Child[]): HTMLElement {
  return h('div', { class: 'input-row' }, ...children);
}

/** A labelled group of related controls (presets, radio rows). */
export function group(label: string, ...children: Child[]): HTMLElement {
  return h('div', { class: 'input-row', role: 'group', 'aria-label': label }, ...children);
}

export interface Stepper {
  readonly element: HTMLElement;
  revealAll(): void;
}

/**
 * One arithmetic step per press. Every line is computed before the stepper is
 * built, so nothing here asserts a result — it reveals values in order.
 */
export function stepper(idPrefix: string, lines: HTMLElement[], labels: string[]): Stepper {
  if (lines.length !== labels.length) throw new Error('one label per line');
  const total = lines.length;
  let shown = 1;
  const list = h('ol', { class: 'step-list', role: 'list' });
  const progress = h('p', { class: 'step-progress', role: 'status', 'aria-live': 'polite' });
  const back = h('button', { type: 'button', class: 'btn btn-ghost', id: `${idPrefix}-back` }, '‹ Back') as HTMLButtonElement;
  const next = h('button', { type: 'button', class: 'btn btn-primary', id: `${idPrefix}-next` }, 'Next step ›') as HTMLButtonElement;
  const all = h('button', { type: 'button', class: 'btn btn-ghost', id: `${idPrefix}-all` }, 'Show every step') as HTMLButtonElement;
  const render = (): void => {
    clear(list);
    for (let i = 0; i < shown; i++) {
      list.append(
        h('li', { class: `step-line reveal${i === shown - 1 ? ' step-current' : ''}`, role: 'listitem' },
          h('span', { class: 'step-tag' }, labels[i]),
          lines[i]),
      );
    }
    progress.textContent = `Step ${shown} / ${total}`;
    back.disabled = shown <= 1;
    next.disabled = shown >= total;
    all.disabled = shown >= total;
  };
  back.addEventListener('click', () => { shown = Math.max(1, shown - 1); render(); });
  next.addEventListener('click', () => { shown = Math.min(total, shown + 1); render(); });
  all.addEventListener('click', () => { shown = total; render(); });
  render();
  const element = h('div', { class: 'stepper' }, h('div', { class: 'stepper-controls' }, back, next, all, progress), list);
  return { element, revealAll: () => { shown = total; render(); } };
}
