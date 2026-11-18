const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(?:white|black|red|green|blue|gray|grey|yellow|orange|purple)\b/i;
const SPACING_PROPERTY =
  /^(?:margin|padding)(?:-[a-z-]+)?$|^(?:row-|column-)?gap$/;
const LENGTH_LITERAL = /(?<![\w-])\d*\.?\d+(?:px|rem|em|vh|vw|%)/;

function withoutTokens(value: string): string {
  return value.replace(/var\([^)]*\)/g, "");
}

function isHardCoded(property: string, value: string): boolean {
  if (property.startsWith("--")) return false;
  const rest = withoutTokens(value);
  if (COLOR_LITERAL.test(rest)) return true;
  if (property === "z-index") return rest.trim() !== "";
  if (property === "font-family")
    return rest.trim() !== "" && rest.trim() !== "inherit";
  if (SPACING_PROPERTY.test(property)) return LENGTH_LITERAL.test(rest);
  return false;
}

/**
 * Finds declarations that hard-code what design tokens should provide (ADR-0011):
 * colour literals, and literal spacing, font families and z-indices.
 * Returns `"<line>: <property>: <value>"` entries; an empty list means the stylesheet is clean.
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
