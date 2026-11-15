import { describe, expect, it } from 'vitest';
import { bsgs, sqrtMethodOps, type Group } from './bsgs';
import { makeFp2 } from '../ec/fp2';
import { modInv, modPow } from '../ec/field';
import { distort, reducedTate } from './pairing';
import { MOV_INSTANCES } from '../data/published';

function multiplicativeGroup(p: bigint): Group<bigint> {
  return {
    identity: 1n,
    mul: (x, y) => (x * y) % p,
    inv: (x) => modInv(x, p),
    key: (x) => x.toString(),
  };
}

describe('baby-step giant-step', () => {
  it('solves every logarithm in a small cyclic group, including l = 0, l = 1 and l = n − 1', () => {
    // 2 generates F_1019*, order 1018.
    const G = multiplicativeGroup(1019n);
    const n = 1018n;
    for (const l of [0n, 1n, 2n, 500n, 1016n, 1017n]) {
      const beta = modPow(2n, l, 1019n);
      const result = bsgs(G, 2n, beta, n);
      expect(result.l).toBe(l);
    }
  });

  it('returns null when β is not a power of α', () => {
    // 4 generates the index-2 subgroup of F_1019*; 2 is not in it.
    const G = multiplicativeGroup(1019n);
    expect(bsgs(G, 4n, 2n, 509n).l).toBeNull();
  });

  it('finds a logarithm that lies in the LAST giant step', () => {
    // n = 2593816829, m = ⌈√n⌉ = 50930, and (m − 1)·m = 2593814970 ≤ n − 1, so
    // l = n − 1 is reached only on the final giant-step iteration i = m − 1.
    const { p, n, P } = MOV_INSTANCES[2];
    const F = makeFp2(p);
    const phi = distort(F, P)!;
    const alpha = reducedTate(F, { p, a4: 1n }, n, P, phi).value;
    const l = n - 1n;
    const beta = F.pow(alpha, l);
    const G: Group<typeof alpha> = { identity: F.one, mul: F.mul, inv: F.inv, key: F.key };
    const result = bsgs(G, alpha, beta, n);
    expect(result.m).toBe(50930n);
    expect((result.m - 1n) * result.m <= l).toBe(true);
    expect(result.l).toBe(l);
    expect(result.giantSteps).toBe(Number(result.m) - 1);
  });

  it('the square-root cost is 2⌈√n⌉', () => {
    expect(sqrtMethodOps(43n)).toBe(14n);
    expect(sqrtMethodOps(1019n)).toBe(64n);
    expect(sqrtMethodOps(49871n)).toBe(448n);
  });
});
