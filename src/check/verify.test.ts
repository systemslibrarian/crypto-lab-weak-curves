import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { independentScalarMultiply, verifyLogarithm } from './verify';
import { MONNERAT_2002, SMART_1999 } from '../data/published';

describe('the independent verifier', () => {
  it("confirms the published logarithms: 16·P = Q (Smart) and 123·P = Q (Monnerat)", () => {
    expect(verifyLogarithm(SMART_1999.curve, SMART_1999.P, SMART_1999.Q, 16n).ok).toBe(true);
    expect(verifyLogarithm(MONNERAT_2002.curve, MONNERAT_2002.P, MONNERAT_2002.Q, 123n).ok).toBe(true);
  });

  it('rejects a wrong scalar and names what it computed', () => {
    const v = verifyLogarithm(SMART_1999.curve, SMART_1999.P, SMART_1999.Q, 17n);
    expect(v.ok).toBe(false);
    expect(v.computed).not.toBeNull();
    expect(v.expected).toEqual(SMART_1999.Q);
  });

  it('compares BOTH coordinates: (x, −y) is a different point', () => {
    const { curve, P, Q } = SMART_1999;
    const negatedQ = { x: Q.x, y: curve.p - Q.y };
    expect(verifyLogarithm(curve, P, negatedQ, 16n).ok).toBe(false);
    expect(verifyLogarithm(curve, P, negatedQ, 43n - 16n).ok).toBe(true);
  });

  it('handles the point at infinity on either side', () => {
    const { curve, P } = SMART_1999;
    expect(verifyLogarithm(curve, P, null, 0n).ok).toBe(true);
    expect(verifyLogarithm(curve, P, null, 43n).ok).toBe(true);
    expect(verifyLogarithm(curve, P, null, 1n).ok).toBe(false);
    expect(verifyLogarithm(curve, P, P, 0n).ok).toBe(false);
    expect(independentScalarMultiply(curve, 0n, P)).toBeNull();
  });

  it('imports nothing from src/attack and nothing from src/ec/curve (invariant 1, checked on the source)', () => {
    const source = readFileSync(new URL('./verify.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual(['../ec/curve']);
    // The one import is `import type`, which erases to nothing at run time.
    expect(source).toMatch(/^import type \{ Curve, Point \} from '\.\.\/ec\/curve';$/m);
    expect(imports.some((i) => i.includes('attack'))).toBe(false);
  });
});
