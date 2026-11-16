# ADR-0006: Notes and wiki as Obsidian-compatible Markdown

- **Status:** Accepted
- **Date:** 2026-11-16

## Decision
Wiki entries and session notes are Markdown files with YAML front matter and `[[wiki links]]`, readable and editable in Obsidian or any text editor.

## Consequences
The editor must round-trip Markdown without losing unknown front-matter keys or syntax it doesn't render.
