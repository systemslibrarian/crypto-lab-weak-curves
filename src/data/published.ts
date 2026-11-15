/**
 * THE ONLY FILE IN src/ THAT HOLDS LITERAL INPUTS.
 *
 * Everything the page prints — orders, traces, embedding degrees, lift digits,
 * pairing values, logarithms, step counts — is computed from these inputs at
 * run time. Two kinds of literal live here, each with its source:
 *
 *   1. PUBLISHED WORKED EXAMPLES, whose inputs are copied from the paper that
 *      printed them. The outputs the page computes are compared against the
 *      paper's values in src/attack/smart.test.ts — those tests state the
 *      expected values from the paper, never from this code.
 *   2. NAMED-CURVE PARAMETERS, copied from the specification that defines each
 *      curve, with the section cited. The lab makes no claim about these
 *      curves beyond the two checks exhibit 5 runs.
 *
 * The MOV instances were generated for this lab (no publication prints them);
 * they are self-certifying because the test asserts l·P = R by scalar
 * multiplication, which does not depend on any pairing code.
 */
import type { AffinePoint, Curve } from '../ec/curve';

export interface WorkedExample {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly curve: Curve;
  readonly P: AffinePoint;
  readonly Q: AffinePoint;
  /** The logarithm the paper reports. Used only to label the example; never handed to the attacker. */
  readonly published: bigint;
}

/** N. P. Smart, "The Discrete Logarithm Problem on Elliptic Curves of Trace One", J. Cryptology 12(3) (1999) 193–196 — the worked example. */
export const SMART_1999: WorkedExample = {
  id: 'smart-1999',
  title: "Smart (1999), p = 43",
  source: 'N. P. Smart, J. Cryptology 12(3) (1999) 193–196, worked example',
  curve: { p: 43n, a2: 39n, a4: 1n, a6: 41n },
  P: { x: 0n, y: 16n },
  Q: { x: 10n, y: 36n },
  published: 16n,
};

/** J. Monnerat, "Computation of the discrete logarithm on elliptic curves of trace one — Tutorial", EPFL technical report IC/2002/49 (2002) — the worked example. */
export const MONNERAT_2002: WorkedExample = {
  id: 'monnerat-2002',
  title: 'Monnerat (2002), p = 1019',
  source: 'J. Monnerat, EPFL technical report IC/2002/49 (2002), worked example',
  curve: { p: 1019n, a2: 0n, a4: 373n, a6: 837n },
  P: { x: 293n, y: 914n },
  Q: { x: 794n, y: 329n },
  published: 123n,
};

/**
 * Smart's curve with a6 changed from 41 to 40. Nothing is published about it;
 * it exists so the refusal path has a concrete curve to refuse. The page counts
 * its points live (48, not 43) rather than trusting this comment.
 */
export const NOT_ANOMALOUS_DEMO: Omit<WorkedExample, 'published'> = {
  id: 'not-anomalous',
  title: 'Not anomalous: p = 43, a6 = 40',
  source: 'constructed for this lab; the count is computed in the page',
  curve: { p: 43n, a2: 39n, a4: 1n, a6: 40n },
  P: { x: 0n, y: 16n },
  Q: { x: 10n, y: 36n },
};

export interface MovInstance {
  readonly bits: 16 | 24 | 32;
  readonly p: bigint;
  readonly n: bigint;
  readonly P: AffinePoint;
  /** R = l·P, with l the secret. The attacker receives (p, n, P, R) only. */
  readonly R: AffinePoint;
  /** The secret, kept here only so the page can label the instance and the test can assert l·P = R. */
  readonly secret: bigint;
}

/** Generated for this lab on y² = x³ + x, p ≡ 3 (mod 4), n prime with n | p + 1. Self-certifying via l·P = R. */
export const MOV_INSTANCES: readonly MovInstance[] = [
  {
    bits: 16,
    p: 199483n,
    n: 49871n,
    P: { x: 161n, y: 131461n },
    R: { x: 84945n, y: 148356n },
    secret: 35339n,
  },
  {
    bits: 24,
    p: 54288523n,
    n: 13572131n,
    P: { x: 47174743n, y: 39673914n },
    R: { x: 17658092n, y: 7307709n },
    secret: 11346322n,
  },
  {
    bits: 32,
    p: 72626871211n,
    n: 2593816829n,
    P: { x: 47713572826n, y: 55808497015n },
    R: { x: 32408132897n, y: 44422958465n },
    secret: 1452258524n,
  },
];

/** A point of order 2 on every y² = x³ + x: outside the order-n subgroup, for the "no logarithm exists" path. */
export const TWO_TORSION_POINT: AffinePoint = { x: 0n, y: 0n };

export interface NamedCurve {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly curve: Curve;
  readonly G: AffinePoint;
  readonly n: bigint;
  readonly h: bigint;
}

/** NIST SP 800-186 (February 2023), §3.2.1.3 "P-256": p, a = −3, b, Gx, Gy, n, h = 1. */
export const P256: NamedCurve = {
  id: 'p256',
  name: 'P-256 (secp256r1)',
  source: 'NIST SP 800-186 (Feb 2023) §3.2.1.3',
  curve: {
    p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
    a2: 0n,
    a4: 0xffffffff00000001000000000000000000000000fffffffffffffffffffffffcn,
    a6: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
  },
  G: {
    x: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
    y: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n,
  },
  n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
  h: 1n,
};

/** SEC 2 v2.0 (27 January 2010), §2.4.1 "Recommended Parameters secp256k1": p, a = 0, b = 7, G, n, h = 1. */
export const SECP256K1: NamedCurve = {
  id: 'secp256k1',
  name: 'secp256k1',
  source: 'SEC 2 v2.0 (Jan 2010) §2.4.1',
  curve: {
    p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,
    a2: 0n,
    a4: 0n,
    a6: 7n,
  },
  G: {
    x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
    y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
  },
  n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
  h: 1n,
};

export const NAMED_CURVES: readonly NamedCurve[] = [P256, SECP256K1];

/**
 * The clause exhibit 5 cites, read before being cited. SEC 1 v2.0 (21 May 2009)
 * §3.1.1.2.1 "Elliptic Curve Domain Parameters over Fp Validation Primitive",
 * step 8: "Check that p^B ≢ 1 (mod n) for all 1 ≤ B < 100, and that n ≠ p."
 * The same two conditions appear as constraints in §3.1.1.1 ("#E(Fp) ≠ p" and
 * "p^B ≢ 1 (mod n) for all 1 ≤ B < 100"); Annex B.1 records that the bound
 * was raised from 20 to 100 in ANSI X9.62. NIST SP 800-186 Appendix C.1
 * states them as criteria 4 ("|E| ≠ q so as to avoid attacks using additive
 * transfers") and 5 ("embedding degrees k ≥ 2^10").
 */
export const SEC1_STEP_8 = {
  source: 'SEC 1 v2.0 §3.1.1.2.1, step 8',
  /** B ranges over 1 ≤ B < 100, so the largest exponent tested is 99. */
  bound: 99,
  wording: 'Check that p^B ≢ 1 (mod n) for all 1 ≤ B < 100, and that n ≠ p.',
} as const;

export const SP800_186_C1 = {
  source: 'NIST SP 800-186 (Feb 2023) Appendix C.1, criteria 4 and 5',
  wording:
    'Each curve E defined over the finite field GF(q) shall have order |E| ≠ q so as to avoid attacks using additive transfers. … Each curve shall have embedding degrees k ≥ 2^10.',
} as const;
