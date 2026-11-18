const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(?:white|black|red|green|blue|gray|grey|yellow|orange|purple)\b/i;
const SPACING_PROPERTY =
  /^(?:margin|padding)(?:-[a-z-]+)?$|^(?:row-|column-)?gap$/;
const LENGTH_LITERAL = /(?<![\w.])-?\d*\.?\d+(?:px|rem|em|vh|vw|%)/;

/** Removes `var(--name)` references; fallbacks (`var(--x, #fff)`) stay visible to the checks. */
function withoutTokens(value: string): string {
  let rest = value;
  for (let previous = ""; previous !== rest;) {
    previous = rest;
    rest = rest.replace(/var\(--[\w-]+\)/g, "");
  }
  return rest;
}

function isHardCoded(property: string, value: string): boolean {
  if (property.startsWith("--")) return false;
  const rest = withoutTokens(value);
  if (COLOR_LITERAL.test(rest)) return true;
  if (property === "z-index") return rest.trim() !== "";
  if (property === "font-family" || property === "font") {
    return rest.trim() !== "" && rest.trim() !== "inherit";
  }
  if (property === "font-size" || SPACING_PROPERTY.test(property)) {
    return LENGTH_LITERAL.test(rest);
  }
  return false;
}

/**
 * Finds declarations that hard-code what design tokens should provide (ADR-0011):
 * colour literals, and literal spacing, fonts, font sizes and z-indices.
 * Returns `"<line>: <property>: <value>"` entries; an empty list means the stylesheet is clean.
 * Known limits: only common colour names are recognised, and a last declaration without `;`
 * is skipped (Prettier always adds it).
 */
export function findHardCodedValues(css: string): string[] {
  const findings: string[] = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
  const declaration = /([a-z-]+)\s*:\s*([^;{}]+);/gi;
  for (const match of source.matchAll(declaration)) {
    const property = (match[1] ?? "").toLowerCase();
    const value = (match[2] ?? "").trim();
    if (isHardCoded(property, value)) {
      const line = source.slice(0, match.index).split("\n").length;
      findings.push(`${String(line)}: ${property}: ${value}`);
    }
  }
  return findings;
}
