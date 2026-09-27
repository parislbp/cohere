import { HighlightStyle } from "@codemirror/language";
import { Tag, tags } from "@lezer/highlight";

/**
 * Highlighting tags emitted by the LaTeX tokenizer. Each custom tag is
 * parented to a standard Lezer tag so generic highlight styles still colour
 * LaTeX sensibly when `latexHighlightStyle` is not installed.
 *
 * Defined here (rather than in `latexLanguage.ts`, which re-exports them) so the
 * highlight style can be built eagerly without a circular import.
 */
export const latexTags = {
  command: Tag.define("latexCommand", tags.macroName),
  mathCommand: Tag.define("latexMathCommand", tags.macroName),
  sectioning: Tag.define("latexSectioning", tags.heading),
  envName: Tag.define("latexEnvName", tags.typeName),
  mathDelim: Tag.define("latexMathDelim", tags.processingInstruction),
  mathContent: Tag.define("latexMathContent", tags.string),
  ref: Tag.define("latexRef", tags.labelName),
  option: Tag.define("latexOption", tags.attributeValue),
  verbatim: Tag.define("latexVerbatim", tags.monospace),
  special: Tag.define("latexSpecial", tags.operator),
  brace: Tag.define("latexBrace", tags.brace),
  keyword: Tag.define("latexKeyword", tags.keyword),
} as const;

export type LatexTagName = keyof typeof latexTags;

/**
 * Colours come from the active theme via CSS custom properties, so the same
 * style works across the light and dark palettes.
 */
export const latexHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: latexTags.command, color: "var(--syn-command)" },
  { tag: latexTags.keyword, color: "var(--syn-keyword)", fontWeight: "500" },
  { tag: latexTags.sectioning, color: "var(--syn-sectioning)", fontWeight: "bold" },
  { tag: latexTags.envName, color: "var(--syn-env)" },
  { tag: latexTags.mathContent, color: "var(--syn-math)" },
  { tag: latexTags.mathDelim, color: "var(--syn-math-delim)", fontWeight: "500" },
  { tag: latexTags.mathCommand, color: "var(--syn-math-command)" },
  { tag: latexTags.ref, color: "var(--syn-ref)" },
  { tag: tags.string, color: "var(--syn-string)" },
  { tag: latexTags.option, color: "var(--syn-option)" },
  { tag: latexTags.brace, color: "var(--syn-brace)" },
  { tag: latexTags.special, color: "var(--syn-special)" },
  { tag: tags.number, color: "var(--syn-number)" },
  { tag: latexTags.verbatim, color: "var(--syn-verbatim)" },
]);
