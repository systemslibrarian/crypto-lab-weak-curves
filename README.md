# Weak Curves

**ECDLP · Smart's anomalous-curve attack · MOV pairing reduction**

Two elliptic-curve discrete-logarithm breaks, run live in the browser on real (toy-sized) curves: Smart's lifting attack on a trace-one curve, and the MOV reduction on a supersingular curve. The published worked examples are reproduced, every recovered logarithm is re-checked by an independent scalar multiplication, and the two group orders that make a valid-looking curve worthless are computed rather than asserted.

> **Not production cryptography — a teaching demo.** Everything runs in your browser; nothing is stored or transmitted, and there is no backend. The curves are toy-sized so the arithmetic stays readable. This page proves nothing about any deployed curve beyond the two checks in Exhibit 5.

## What It Is

A big prime field does not make a curve safe. **The number of points decides.**

```
#E(F_p) = p + 1 − t          t is the trace of Frobenius

t = 1   ⇒  #E = p            anomalous   → Smart's attack, linear time
n | p^k − 1 for small k      small embedding degree → MOV/Frey–Rück transfer
```

Two attacks are implemented, both hand-rolled so every intermediate value is inspectable:

- **Smart's attack** on a curve with exactly `p` points. Each point is lifted one level up — from arithmetic modulo `p` to arithmetic modulo `p²` — where the group has a hidden *additive* structure. Multiplying by `p` lands in the formal group, where `ψ(S) = −x(S)/y(S)` is a homomorphism onto `pZ/p²Z`, and the logarithm falls out of a single division. Implemented in [`src/attack/smart.ts`](src/attack/smart.ts), after N. P. Smart, *The Discrete Logarithm Problem on Elliptic Curves of Trace One*, Journal of Cryptology **12**(3) (1999) 193–196, in the form J. Monnerat's tutorial (EPFL technical report IC/2002/49, 2002) presents it. The same attack was found independently and in the same period by Satoh and Araki (*Comment. Math. Univ. St. Pauli* **47** (1998) 81–92) and Semaev (*Math. Comp.* **67** (1998) 353–356); SEC 1 calls it the Semaev–Smart–Satoh–Araki attack. One trap is handled explicitly: if the integer curve used for the lift is the *canonical* lift, `ψ(p·P′) ≡ 0` and the division has nothing to divide by. For curves `y² = x³ + b` (j = 0) the lift on the curve's own coefficients is always canonical, so the attack then re-lifts onto `y² = x³ + a2x² + (a4 + k·p)x + (a6 + k·p)` — the same curve modulo `p` — and the stepper shows which lift it used. The tests include A. Miyaji's 128-bit anomalous curves (AUSCRYPT '92), two of which have j = 0.
- **The MOV reduction** on the supersingular family `y² = x³ + x` over `p ≡ 3 (mod 4)`, where `#E = p + 1` and every prime-order subgroup has embedding degree 2. A pairing carries the logarithm off the curve and into `F_{p²}`, where it is solved by baby-step giant-step. Implemented in [`src/attack/pairing.ts`](src/attack/pairing.ts) and [`src/attack/mov.ts`](src/attack/mov.ts), after A. Menezes, T. Okamoto and S. A. Vanstone, *Reducing elliptic curve logarithms to logarithms in a finite field*, IEEE Transactions on Information Theory **39**(5) (1993) 1639–1646.

**One deliberate difference from the 1991/1993 paper, stated on the page as well as here.** MOV uses the **Weil** pairing with an independent torsion point drawn from the extension field. This lab computes the **reduced Tate pairing** `t(P, Q) = f_{n,P}(Q)^((p² − 1)/n)` with the **distortion map** `φ(x, y) = (−x, i·y)` on one fixed supersingular family — the usual modern presentation, needing far less machinery. The transfer demonstrated is the same; the pairing computed is not the same one, and the page says which it computed.

**Security model.** The attacker is given `(curve, P, Q)` and nothing else. It returns a *candidate* scalar and never a verdict: whether `m·P = Q` is decided by [`src/check/verify.ts`](src/check/verify.ts), which imports nothing from `src/attack/` and carries its own scalar multiplication so a defect in the shared arithmetic cannot make the attack and its check agree by construction. Every secret and every random point comes from `crypto.getRandomValues` through rejection sampling. All arithmetic is exact `BigInt`; there is no floating point in any field, curve or pairing operation, and no cryptographic library — every part is the subject.

## Exhibits

1. **Count the points** — Type a prime and the coefficients of `y² = x³ + a₂x² + a₄x + a₆`, and the page counts the points one `x` at a time. It reports `#E`, the trace `t`, the factorisation of `#E`, the largest prime factor `n`, and the embedding degree `k` — the smallest `k` with `p^k ≡ 1 (mod n)` — with a table of `p^k mod n` and an honest "greater than B" when no such `k` exists below the bound. The curve is labelled anomalous, supersingular or neither **from the computed numbers**, never from the preset's name. Fails closed on `p = 2`, `p = 3`, composite `p`, a singular curve, and `p` above the enumeration cap.
2. **Smart's attack, stepped** — Smart's published example over `F_43` and Monnerat's over `F_1019`, one arithmetic step per press: the Hensel lift digit, the check that the lifted point satisfies the curve modulo `p²`, the multiplication by `p − 1`, the two `ψ` values and the slope they are read from, the division — and then a **compute-both-sides comparison**, showing `m·P` as the independent checker recomputed it beside `Q` as given. A third preset is a curve that is *not* anomalous, so the refusal path is one click away and names the counted order.
3. **Find your own anomalous curve** — Pick a prime (or draw one) and the page searches random curves over that field, counting each, until one has exactly `p` points. Then it draws a random base point and a random secret, hands the attacker only the curve and the two points, and lets the independent check decide. The attack's operation count is printed beside the count a generic square-root method would need.
4. **The MOV reduction, stepped** — Three instance sizes (`n` of about 16, 24 and 32 bits). Each step shows a real value: the preconditions checked rather than assumed, the distorted point, the Miller loop accumulating `f` and the running multiple `T` to `n·P = O`, the final exponentiation, `α` and `β` printed as `a + b·i`, the baby-step giant-step search in `F_{p²}`, and the independent check `l·P = R` back on the curve. The target can be the published point, a freshly drawn secret, or the 2-torsion point — which is outside the subgroup and produces **"no logarithm exists"**, never a wrong number.
5. **Is this curve weak?** — The two cheap checks from SEC 1, run live at full size on **P-256** and **secp256k1** with parameters copied from their primary specifications (`n·G = O` is computed on the page, not asserted), and then on this lab's own weak curves, which fail them.
6. **Valid, and broken** — The whole lesson in one panel. A curve passes every line of the ordinary validation checklist — prime field, non-singular, base point on the curve, prime-order subgroup — each as its own green verdict. One press recovers the secret and verifies it. The verdict reads **`VALID CURVE, PRIME ORDER — AND BROKEN`**. The two checks from Exhibit 5 are missing from that checklist *on purpose*, and the page says so: ordinary validity checks do not include them, which is precisely why the standards had to add them.

Each exhibit carries a one-line "what this isn't" note for every non-goal it borders on.

## When to Use It

- **Use** it to see why "256-bit prime field" says nothing on its own about the hardness of a discrete logarithm.
- **Use** it to understand what the two domain-parameter checks in SEC 1 and SP 800-186 are actually defending against, and why they are cheap enough that there is no excuse for skipping them.
- **Do NOT** conclude anything about a deployed curve from this page beyond the two checks in Exhibit 5. Passing them rules out exactly the two attacks shown here. It says nothing about twist security, invalid-curve attacks, side channels, small-subgroup cofactors, or the provenance of the parameters.
- **Do NOT** take any code here as production cryptography. It is optimised for transparency, not constant-time safety, and the curves are toy-sized.

## Live Demo

**https://systemslibrarian.github.io/crypto-lab-weak-curves/**

Count a curve's points and watch it be labelled from the numbers. Step through Smart's attack on the 1999 example and see the published lift digits come out. Search for your own anomalous curve, let the page draw a secret you never see, and watch it come back verified. Step the MOV reduction into `F_{p²}` and back. Then open Exhibit 6, read a checklist that is entirely green, and press one button.

## What Can Go Wrong

- **The toy-size honesty statement.** At the sizes a browser can run, the MOV transfer **buys nothing**: baby-step giant-step in `F_{p²}` costs the same `~2√n` as it would on the curve itself, and the page prints both numbers side by side rather than claiming a speed-up. The reduction mattered historically because finite fields admit *sub-exponential* logarithm algorithms — index calculus, the number field sieve — and elliptic-curve groups do not. Those algorithms are **named here and not built**. A toy shows the transfer, not the win.
- **Smart's attack is different, and the page says so.** It is genuinely linear-time at any size. What limits this lab is only that anomalous curves of cryptographic size are produced by the complex-multiplication method, which is out of scope. At `p = 43` the attack's operation count and the square-root count happen to be equal; by `p = 1019` the attack is already half the cost, and the gap grows as `√p / log p`.
- **A number is not a logarithm.** Every attack path can return a value that is wrong — a target outside the subgroup, a curve that does not meet the preconditions. Every one of them is reported as a refusal or as "no logarithm exists", because the verdict is produced by a module that re-multiplies the base point and compares *both* coordinates.
- **Point counting by enumeration caps the lab.** `p` is capped at 20,000 for counting and 4,000 for the curve search. Above that the page refuses with the reason and names Schoof's algorithm, rather than appearing to hang.
- **Validation is not security.** Exhibit 6 is a reachable state in which every check the page performs reports success and the discrete logarithm falls anyway. That is the lab's negative claim, and it is asserted as a test, not written as a disclaimer.

## Real-World Usage

Both curve classes are **excluded by the standards**, in clauses that were read before being cited here:

- **SEC 1 v2.0** (21 May 2009) §3.1.1.2.1, *Elliptic Curve Domain Parameters over Fp Validation Primitive*, **step 8**: *"Check that p^B ≢ 1 (mod n) for all 1 ≤ B < 100, and that n ≠ p."* The same two conditions appear as generation constraints in §3.1.1.1. Annex B.1 records that the bound was raised from `B ≥ 20` to `B ≥ 100` in ANSI X9.62 "to provide a large margin for safety", and names both attack families — Menezes–Okamoto–Vanstone and Frey–Rück for the first condition, Semaev–Smart–Satoh–Araki for the second.
- **NIST SP 800-186** (February 2023) Appendix C.1, criteria 4 and 5: *"Each curve E defined over the finite field GF(q) shall have order |E| ≠ q so as to avoid attacks using additive transfers"* and *"Each curve shall have embedding degrees k ≥ 2^10."* The `2^10` bound is a far larger margin than SEC 1's 100; both exclude every curve on this page.

Exhibit 5 runs exactly those two conditions against P-256 ([SP 800-186 §3.2.1.3](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-186.pdf)) and secp256k1 ([SEC 2 v2.0 §2.4.1](https://www.secg.org/sec2-v2.pdf)), computing `n·G` on the page as a check that the parameters were transcribed correctly.

Pairing-friendly curves invert the second condition deliberately: BLS12-381 and BN curves are *chosen* to have a small embedding degree, because the transfer that breaks a signature curve is the mechanism that makes identity-based encryption and BLS signatures possible. Small `k` is a weakness only relative to what you wanted the curve for.

## How to Run Locally

```bash
npm install
npm run dev              # http://localhost:5173/crypto-lab-weak-curves/
npm run build            # maintenance controls + typecheck + production build
npm test                 # 111 unit tests (Vitest)
npm run test:maintenance # 17 repository-structure controls
npm run test:a11y        # WCAG 2.1 AA axe gate (builds first)
npm run test:claims      # the claims suite, incl. the negative claim
npm run test:e2e:all     # both browser projects
npm run test:mutation    # the §4.1c mutation ledger: 9 patches, applied and restored
```

## Related Demos

- [crypto-lab-twist-trap](https://systemslibrarian.github.io/crypto-lab-twist-trap/) — quadratic-twist and invalid-curve secret recovery: defeating validation by handing over a point that is not on the curve at all, where this lab breaks a point that is.
- [crypto-lab-pairing-gate](https://systemslibrarian.github.io/crypto-lab-pairing-gate/) — BLS signatures on BLS12-381, where a small embedding degree is the feature rather than the flaw.
- [crypto-lab-log-forge](https://systemslibrarian.github.io/crypto-lab-log-forge/) — generic discrete-logarithm algorithms, Pohlig–Hellman and index calculus: the `√n` baseline this lab measures against, and the sub-exponential family that makes the MOV transfer worth making.
- [crypto-lab-isogeny-gate](https://systemslibrarian.github.io/crypto-lab-isogeny-gate/) — supersingular curves over a small field from the other direction, where `#E = p + 1` is the structure being walked rather than attacked.
- [crypto-lab-key-exchange](https://systemslibrarian.github.io/crypto-lab-key-exchange/) — ECDH and what skipping parameter validation costs.

## Build & Verify

**157 tests in total**, all run in CI before any deploy.

- **111 unit tests** (Vitest, colocated `src/**/*.test.ts`).
  - **The published worked examples are the reference values.** [`src/attack/smart.test.ts`](src/attack/smart.test.ts) asserts Smart's lift digits (20 and 40), his `ψ` values (19 and 3) and `m = 16`, and Monnerat's (digits 308 and 561, `ψ` values 367 and 305, `m = 123`) — taken from the papers and independently recomputed twice before this lab was written, never read off this implementation.
  - **The MOV instances were generated for this lab** — no publication prints them — and are **self-certifying**: [`src/attack/mov.test.ts`](src/attack/mov.test.ts) and [`src/attack/pairing.test.ts`](src/attack/pairing.test.ts) assert `l·P = R` by scalar multiplication, which uses no pairing code, alongside `p` prime and `≡ 3 (mod 4)`, `n` prime and dividing `p + 1`, `n·P = O`, `α^n = 1`, `α ≠ 1`, `β = α^l`, and bilinearity `e(aP, φ(P)) = e(P, φ(P))^a` over 20 random `a`.
  - **Every fail-closed path is a named test**: each precondition refusal, `p` not prime, `p = 2` or `3`, a singular curve, a point off the curve, `P = O`, a point with `y = 0`, `Q` outside the subgroup, `m = 0`, `m = 1`, `m = p − 1`, an embedding degree above the cap, and `p` above the enumeration cap.
  - **Invariants are tested as invariants**: the verifier's import list is asserted on the source, the attacker is constructed before the secret exists, and a source scan proves the global pseudo-random generator is referenced nowhere in executing code under `src/`.
- **17 repository-structure controls** ([`tests/maintenance-controls.node.mjs`](tests/maintenance-controls.node.mjs)), run by `npm run build` so a drift fails the build rather than the deploy: every action commit-pinned, the Pages credentials confined to the deploy job, the gate the auto-merge runs being the gate the deploy runs, the Playwright port unique and strict, and the mutation ledger still applicable to the source.
- **27 claims tests** ([`e2e/claims.spec.ts`](e2e/claims.spec.ts)) — what the page *says*. Each recomputes the claim from the page's own raw inputs **by a different route than the source takes**: the point count by Euler's criterion rather than the page's residue table, modular inverses by Fermat rather than extended Euclid, the embedding degree by checking that no smaller `k` works, `m·P = Q` by a ladder written out in the spec, `β = α^l` in `F_{p²}`, and both operation counts derived from the binary expansion of `p − 1`. Plus evidence retirement, the no-op guard, the `[hidden]` probe, a check that no verdict wording escapes a marker, and a check that no marker id is rendered twice.
- **2 accessibility tests** ([`e2e/a11y.spec.ts`](e2e/a11y.spec.ts)) — `@axe-core/playwright` over the **production build**, at desktop and 380px, driven through ~40 real states including every refusal path. The oracle is wider than axe: `violations` **and** `incomplete`, arithmetic composite-aware contrast (including inside `aria-hidden` subtrees), WCAG 1.4.11 non-text contrast ratcheted against an empty baseline, 1.4.10 reflow, keyboard reachability of the one scroll region, and a reduced-motion end-state check. **Zero violations.**
- **The §4.1c mutation ledger** ([`mutations/registry.json`](mutations/registry.json), [`mutations/run.mjs`](mutations/run.mjs)) — **9 of 9 killed**. Each mutation is a concrete patch, not a sentence describing one, and a kill requires all five of: the unmutated baseline passed in the same run; the patch changed the file; the mutated source still type-checked; the built bundle's hash moved; and the *owning* test failed, not a build error or a dead server. Every `observed` record in that file was written by the runner, never typed. The ninth exists only to prove the accessibility gate itself bites: it degrades the one token every control boundary on the page draws its edge from, and the 1.4.11 oracle — the only oracle that can see it, since axe has no rule for non-text contrast — catches it.

## Performance

Everything runs in the browser in `BigInt`, with no backend and no network I/O after the static load. The production bundle is 53 kB of JavaScript (20 kB gzipped) and 8.9 kB of CSS (2.6 kB gzipped), with no runtime dependencies.

Point counting is `O(p)` and capped at `p = 20,000`; the anomalous-curve search is capped at `p = 4,000` because it expects about `2√p` attempts. Smart's attack is two scalar multiplications modulo `p²` and completes instantly at any size this lab allows. The largest MOV instance has a 32-bit `n`, so baby-step giant-step tabulates `⌈√n⌉ = 50,930` field elements — a fraction of a second, and the slowest thing the page does.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
