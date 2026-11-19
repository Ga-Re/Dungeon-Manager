# ADR-0016: Sizes in rem of one base size; spacing grid in quarter rems

- **Status:** Proposed
- **Date:** 2026-11-19
- **Deciders:** DM (product owner), agent
- **Supersedes:** ADR-0011's "strict 4/8 px spacing grid" (Design references, "Refined for a professional look"). Everything else in ADR-0011, ADR-0014 and ADR-0015 stays in force.

## Context
ADR-0011 asked for "a strict 4/8 px spacing grid and a fixed type scale". T-162 then made the DM window compact and added an interface size setting (90 / 100 / 110 / 125 %, DM decision, 2026-11-19), so that the title bar, ribbon and type are smaller and the DM can still choose a larger interface.

A size setting only works if all sizes follow one value. T-162 therefore expressed every size in rem of the DM window's root size, which is `--dm-ui-base-size` (14px) × `--dm-ui-scale`. The spacing tokens became quarter rems: 0.25, 0.5, 0.75, 1, 1.5 and 2 rem. At 100 % that is 3.5 / 7 / 10.5 / 14 / 21 / 28 px, which no longer matches the literal 4/8 px grid of ADR-0011.

## Options considered
1. **Keep literal px spacing** (4/8 px) and scale only type and icons. Pros: matches ADR-0011 word for word. Cons: at 90 % or 125 % spacing and content fall out of proportion; two scaling systems to maintain.
2. **Scale with CSS `zoom` on the chrome** and keep px inside. Pros: no unit change. Cons: zoomed coordinates break the drag and clamp maths of the tool windows and pointer mapping; the map canvas must be excluded by hand; inconsistent engine support.
3. **Everything in rem of one base size; the 4/8 grid in quarter rems (chosen).** Pros: one value scales the whole window; proportions stay the same at every size; the map canvas is unaffected because it only measures its box. Cons: spacing values are fractional px at most sizes; geometry that mixes fixed px (borders) with rem must be written so it stays aligned (done for the tree guides in T-162).

## Decision
Option 3. The grid keeps its rhythm: steps of a quarter and a half of the base size. The absolute pixel values follow the DM's chosen size.

## Consequences
- **Rule:** spacing uses the `--dm-space-*` tokens only. They are 0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 rem of the DM window's base size. Component sizes such as icons, row heights and panel widths are also in rem. Only hairlines, borders, focus rings and radii stay in px.
- **Readability floor:** `--dm-font-size-xs` never drops below 10px (`max(10px, 0.75rem)`).
- **Map:** the interface size never scales the map canvas; an E2E test covers it (T-162).
- **Docs:** ARCHITECTURE §15 and the ui-design skill describe the rule. When accepting, the DM marks ADR-0011's "strict 4/8 px spacing grid" as superseded by this ADR.
- **Other apps:** the companion keeps its own root size if it adopts the tokens later; quarter-rem spacing then follows that size.
