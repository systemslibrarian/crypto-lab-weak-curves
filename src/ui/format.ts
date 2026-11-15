import type { Point } from '../ec/curve';

/** Parse a non-negative integer typed by the reader: decimal digits, or 0x-prefixed hex. */
export function parseInteger(text: string): bigint | null {
  const t = text.trim().replace(/[\s_]/g, '');
  if (/^0x[0-9a-f]+$/i.test(t)) return BigInt(t);
  if (/^[0-9]+$/.test(t)) return BigInt(t);
  return null;
}

export function pointText(P: Point): string {
  return P === null ? 'O (point at infinity)' : `(${P.x}, ${P.y})`;
}

export function hex(n: bigint): string {
  return `0x${n.toString(16)}`;
}

export function plural(count: number | bigint, noun: string): string {
  const c = typeof count === 'bigint' ? count : BigInt(count);
  return `${c} ${noun}${c === 1n ? '' : 's'}`;
}
