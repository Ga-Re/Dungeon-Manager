// Writes styles/tokens.css from the built token definitions (run via `pnpm gen:tokens`).
// A unit test fails when the committed file and src/tokens.ts disagree.
import { writeFileSync } from "node:fs";
import { URL } from "node:url";
import { tokensToCss } from "../dist/tokens.js";

writeFileSync(new URL("../styles/tokens.css", import.meta.url), tokensToCss());
