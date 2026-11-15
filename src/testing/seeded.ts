/**
 * A deterministic RandomSource for TESTS ONLY (xorshift32). Nothing under
 * src/ui/ or src/attack/ imports it; the page uses webCryptoSource.
 */
import type { RandomSource } from '../secret/random';

export function seededSource(seed: number): RandomSource {
  let state = (seed >>> 0) || 0x9e3779b9;
  return {
    fill(buffer) {
      for (let i = 0; i < buffer.length; i++) {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        buffer[i] = state & 0xff;
      }
    },
  };
}
