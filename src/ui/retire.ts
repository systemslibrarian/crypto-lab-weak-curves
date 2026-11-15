import { clear, evidenceRetired, h } from './dom';

/**
 * A result area that knows which inputs produced it.
 *
 * `show` records a key built from the inputs at run time; `sync` is called on
 * every input event with the key built from the inputs NOW. A different key
 * retires the stale result and says so; the SAME key (a value retyped
 * unchanged) leaves a fresh result alone — the no-op guard the claims suite
 * checks.
 */
export interface ResultSlot {
  readonly area: HTMLElement;
  show(node: Node, key: string): void;
  sync(key: string): void;
  reset(): void;
  hasResult(): boolean;
}

export function resultSlot(host: HTMLElement, retiredText: string): ResultSlot {
  const area = h('div', { class: 'result-area' });
  host.append(area);
  let key: string | null = null;
  return {
    area,
    show(node, newKey) {
      clear(area);
      area.append(node);
      key = newKey;
    },
    sync(current) {
      if (key === null || current === key) return;
      clear(area);
      area.append(evidenceRetired(retiredText));
      key = null;
    },
    reset() {
      clear(area);
      key = null;
    },
    hasResult: () => key !== null,
  };
}
