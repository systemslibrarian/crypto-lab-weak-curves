import type { PointCount } from '../ec/count';
import type { Curve } from '../ec/curve';

/** The curve exhibit 3 found, offered to exhibit 6. Nothing secret lives here. */
export interface FoundCurve {
  readonly curve: Curve;
  readonly count: PointCount;
}

let found: FoundCurve | null = null;
const listeners = new Set<(f: FoundCurve | null) => void>();

export function setFoundCurve(f: FoundCurve | null): void {
  found = f;
  for (const l of listeners) l(found);
}

export function getFoundCurve(): FoundCurve | null {
  return found;
}

export function onFoundCurve(listener: (f: FoundCurve | null) => void): void {
  listeners.add(listener);
  listener(found);
}
