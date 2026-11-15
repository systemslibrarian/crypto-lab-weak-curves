import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { randomBelow, randomCurve, randomPoint, randomPrime, randomScalar } from './random';
import { discriminant, isOnCurve } from '../ec/curve';
import { isProbablePrime } from '../ec/field';
import { seededSource } from '../testing/seeded';

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const root = new URL('../', import.meta.url).pathname;

describe('randomness: every secret comes from the platform generator', () => {
  it('randomBelow stays inside [0, bound) and reaches both ends with a deterministic source', () => {
    const source = seededSource(1);
    const seen = new Set<bigint>();
    for (let i = 0; i < 2000; i++) {
      const v = randomBelow(5n, source);
      expect(v >= 0n && v < 5n).toBe(true);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
    expect(randomBelow(1n, source)).toBe(0n);
    expect(() => randomBelow(0n, source)).toThrow(RangeError);
  });

  it('rejection sampling: for bound 257 the top byte is masked to 9 bits and values ≥ 257 are rejected, never reduced', () => {
    // A source that returns 0x01 0xff (= 511) first, then 0x00 0x05 (= 5):
    // a modulo reduction would answer 511 mod 257 = 254; rejection answers 5.
    const bytes = [0x01, 0xff, 0x00, 0x05];
    let cursor = 0;
    const source = { fill: (b: Uint8Array) => b.forEach((_, i) => (b[i] = bytes[cursor++] ?? 0)) };
    expect(randomBelow(257n, source)).toBe(5n);
  });

  it('randomScalar lies in [1, n − 1]', () => {
    const source = seededSource(3);
    for (let i = 0; i < 500; i++) {
      const s = randomScalar(43n, source);
      expect(s >= 1n && s <= 42n).toBe(true);
    }
  });

  it('randomPoint is on the curve with y ≠ 0, for both p ≡ 3 and p ≡ 1 (mod 4)', () => {
    const source = seededSource(4);
    for (const p of [1019n, 1009n]) {
      const curve = { p, a2: 0n, a4: 7n, a6: 11n };
      for (let i = 0; i < 50; i++) {
        const P = randomPoint(curve, source);
        expect(P).not.toBeNull();
        expect(isOnCurve(curve, P)).toBe(true);
        expect(P!.y).not.toBe(0n);
      }
    }
  });

  it('randomPrime returns primes in range and randomCurve returns non-singular curves', () => {
    const source = seededSource(5);
    for (let i = 0; i < 20; i++) {
      const p = randomPrime(100n, 4000n, source);
      expect(isProbablePrime(p)).toBe(true);
      expect(p >= 100n && p <= 4000n).toBe(true);
      expect(discriminant(randomCurve(p, source))).not.toBe(0n);
    }
  });

  it('the global pseudo-random generator is referenced nowhere in executing code under src/, and the page never imports the test seed', () => {
    // COMMENTS ARE STRIPPED FIRST, and that is the point of the test rather
    // than a loophole in it. The rule is about what the code DOES; several
    // files legitimately name the forbidden generator in prose to say they do
    // not use it, and a scan of raw text makes writing that sentence a
    // failure — which is how a true comment gets deleted to make a check pass.
    // Stripping comments also makes the rule stricter than a call-site grep:
    // any reference at all fails, whether or not it is immediately invoked.
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
    // Assembled from two halves so this spec file is not itself a hit.
    const forbidden = new RegExp(['Math', '\\s*\\.\\s*', 'random'].join(''));
    let scanned = 0;
    for (const file of walk(root)) {
      if (!file.endsWith('.ts')) continue;
      scanned += 1;
      const source = readFileSync(file, 'utf8');
      expect(stripComments(source), file).not.toMatch(forbidden);
      if (!file.endsWith('.test.ts') && !file.includes('/testing/')) {
        expect(source, file).not.toMatch(/testing\/seeded/);
      }
    }
    // A declared denominator: a walk that finds nothing passes vacuously.
    expect(scanned).toBeGreaterThan(15);
  });

  it('that scan would catch a real call: the stripper leaves code alone and only removes comments', () => {
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
    const forbidden = new RegExp(['Math', '\\s*\\.\\s*', 'random'].join(''));
    const call = ['const x = Math', '.', 'random();'].join('');
    expect(stripComments(call)).toMatch(forbidden);
    expect(stripComments(`/* a comment naming Math${'.'}random */\nconst y = 1;`)).not.toMatch(forbidden);
    expect(stripComments(`// a line comment naming Math${'.'}random\nconst y = 1;`)).not.toMatch(forbidden);
  });
});
