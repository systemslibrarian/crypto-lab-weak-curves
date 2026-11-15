/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * IT IS EMPTY, AND THAT IS THE POINT — the terminal state of the ratchet, not
 * an unrun check. This lab was authored to the 1.4.11 lessons its reference
 * gate recorded: every control edge is `--control-border` or a full-strength
 * tone, the selected tab and primary button carry an `--accent-ink` border
 * rather than one the colour of their own fill, and the Miller-loop scroll
 * region is bordered with `--control-border` so it reads as a control. A run
 * with `NT_BASELINE_CAPTURE=1` set prints every finding through this same path
 * and asserts nothing, which is how this file would be regenerated.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
