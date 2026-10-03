/**
 * Length caps of the `prompts` overrides. A module of its own (no imports) so the settings panel, which is built
 * for the browser, can validate against the same numbers the plugin enforces.
 * @module dsh-browser/prompt-limits
 */

/** A `prompts.skill.bodyFile` larger than this many characters is not used. */
export const SKILL_BODY_FILE_LIMIT = 20_000

/** Length caps (in characters) of each kind of override. A longer value is ignored, not truncated. */
export const PROMPT_LIMITS = {
  /** A group or action summary: one line of the catalog. */
  summary: 300,
  /** The extra guidance of an action or sub-action. */
  notes: 1000,
  /** The text of a detail topic (`observe.read.controls`), which is a page of its own. */
  topicText: 3500,
  /** A tool description (`prompts.tools.<tool>.description`). */
  description: 1500,
  /** The compact guide that replaces the skill pointer at the root. */
  rootGuide: 1500,
  /** The deployer's note at the end of the root. */
  rootNote: 800,
  /** The hint of one error code. */
  errorHint: 600,
  /** The skill's description in the skill list. */
  skillDescription: 1000,
  /** Text appended to the skill body. */
  skillAppend: 4000,
  /** A `skill.bodyFile` larger than this falls back to the packaged body. */
  skillBodyFile: SKILL_BODY_FILE_LIMIT,
} as const
