# ADR-0015: Dark "workshop" theme as default, reduced parchment as the light theme

- **Status:** Proposed
- **Date:** 2026-11-19
- **Deciders:** DM (product owner), agent
- **Supersedes:** the "Readability first" palette rule and the night variant of ADR-0011. Zones (ADR-0014), tokens, layering and the restrained styling rules of ADR-0011 stay in force.

## Context
ADR-0011 chose a light parchment look with dark chrome as the default and a dimmed "night" variant. After T-130 to T-154 the DM found the result "too playful and simple". Next to Fusion 360 it feels less tidy and less organised (2026-11-19). The DM compared two directions in a mock-up, both with the same structure: transparent browser, details panel, docked zones.

- **A · Workshop:** dark slate surfaces, one gold accent, small all-caps headers, thin separators, compact rows, no serif type.
- **B · Parchment, reduced:** today's light parchment, but flatter, with no serif headings, tighter spacing and all-caps captions.

The DM chose **both as themes**: A as the default and B as the selectable light theme. The old night variant goes.

What makes the reference feel more professional, and what both themes therefore share:
- a clear hierarchy (small caps headers, compact rows);
- little colour: one accent for "active" and "selected" only;
- thin lines instead of boxes and shadows;
- one type family, monospace only for file names and values;
- tools as icons, text only in group captions.

## Options considered
1. **Keep ADR-0011** (parchment default, night variant) and only polish spacing. Pros: no theme work. Cons: the DM explicitly finds it too playful; the light default glares in a dim room.
2. **A only (dark workshop)**. Pros: one theme to maintain, best in a dim room. Cons: no light option for daytime prep; removes the parchment identity entirely.
3. **B only (reduced parchment)**. Pros: stays within ADR-0011. Cons: still light by default at the table; the DM preferred the dark look as the default.
4. **A as default, B as light theme (chosen)**. Pros: the dim-room case gets the dark default, prep in daylight gets a light theme, and the fantasy identity survives in B and in A's gold accent. Cons: two palettes to keep at WCAG AA; screenshots per theme where it matters.

## Decision
Option 4. The token layer of ADR-0011 already makes a theme a set of values. Switching the default and the variants costs little and gives the DM both looks.

## Consequences
- **Themes:** `workshop` (dark, default) and `parchment` (light). The appearance setting stays "follow the OS / light / dark". Light means parchment and dark means workshop. The stored values do not change, so no migration is needed. On first start the default is dark.
- **Typography:** headings use the UI sans-serif (no serif). Captions are small caps. Radii and shadows get smaller.
- **Contrast:** both palettes pass the existing WCAG AA pair tests (text 4.5:1, UI parts 3:1).
- **Screenshots:** the DM-window golden uses the default (workshop).
- **Follow-up:** T-157 implements the themes and the flatter base. T-158 (browser) and T-159 (details panel) build on it.
- **Docs:** ARCHITECTURE §15 and the ui-design skill describe the themes. When accepting, the DM marks ADR-0011's palette and night rule as superseded.
