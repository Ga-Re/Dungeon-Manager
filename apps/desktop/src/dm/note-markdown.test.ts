import { describe, expect, it } from "vitest";
import {
  findByName,
  remarkObsidian,
  resolveRelative,
  splitFrontMatter,
  urlTransform,
} from "./note-markdown.js";

describe("front matter (T-163)", () => {
  it("splits off the YAML head as flat properties, lists joined", () => {
    expect(
      splitFrontMatter(
        '---\nrole: villain\ntags:\n  - vampire\n  - boss\nalias: "Graf"\n---\n# Strahd\n',
      ),
    ).toEqual({
      properties: [
        ["role", "villain"],
        ["tags", "vampire, boss"],
        ["alias", "Graf"],
      ],
      body: "# Strahd\n",
    });
  });

  it("leaves notes without front matter, or with an unclosed head, as they are", () => {
    expect(splitFrontMatter("# Nur Text\n")).toEqual({
      properties: [],
      body: "# Nur Text\n",
    });
    expect(splitFrontMatter("---\nrole: x\n# kein Ende\n")).toEqual({
      properties: [],
      body: "---\nrole: x\n# kein Ende\n",
    });
  });
});

describe("paths in notes", () => {
  it("resolves relative to the note and never leaves the campaign folder", () => {
    expect(resolveRelative("notes/scenes/a.md", "bilder/karte.png")).toBe(
      "notes/scenes/bilder/karte.png",
    );
    expect(resolveRelative("notes/scenes/a.md", "../../wiki/Strahd.md")).toBe(
      "wiki/Strahd.md",
    );
    expect(resolveRelative("notes/a.md", "./x%20y.png")).toBe("notes/x y.png");
    expect(resolveRelative("notes/a.md", "../../../etc/passwd")).toBeNull();
    expect(resolveRelative("notes/a.md", "/abs.png")).toBeNull();
  });

  it("finds Obsidian targets by name, next to the note first", () => {
    const files = [
      "wiki/Strahd.md",
      "notes/scenes/Strahd.md",
      "bilder/wappen.png",
      "notes/scenes/wappen.png",
    ];
    expect(findByName(files, "notes/scenes/a.md", "Strahd", ".md")).toBe(
      "notes/scenes/Strahd.md",
    );
    expect(findByName(files, "notes/campaign.md", "wappen.png", "")).toBe(
      "bilder/wappen.png",
    );
    expect(findByName(files, "notes/a.md", "wiki/Strahd", ".md")).toBe(
      "wiki/Strahd.md",
    );
    expect(findByName(files, "notes/a.md", "fehlt.png", "")).toBeNull();
  });

  it("keeps only safe urls: notes, embeds, relative paths and https", () => {
    expect(urlTransform("note-link:Strahd")).toBe("note-link:Strahd");
    expect(urlTransform("obsidian-embed:a.png")).toBe("obsidian-embed:a.png");
    expect(urlTransform("bilder/a.png")).toBe("bilder/a.png");
    expect(urlTransform("https://example.org/a.png")).toBe(
      "https://example.org/a.png",
    );
    for (const unsafe of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
      "http://example.org/a.png",
      "dmlib://localhost/campaigns/x",
    ])
      expect(urlTransform(unsafe)).toBe("");
  });
});

describe("Obsidian syntax", () => {
  type Node = {
    type: string;
    value?: string;
    url?: string;
    alt?: string;
    children?: Node[];
    data?: Record<string, unknown>;
  };
  const run = (tree: Node) => {
    remarkObsidian()(tree);
    return tree;
  };
  const paragraph = (value: string): Node => ({
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value }] }],
  });

  it("turns [[links]] and ![[embeds]] into link and image nodes", () => {
    const tree = run(
      paragraph("Siehe [[Strahd|den Grafen]] und ![[wappen.png]]."),
    );
    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "Siehe " },
      {
        type: "link",
        url: "note-link:Strahd",
        children: [{ type: "text", value: "den Grafen" }],
      },
      { type: "text", value: " und " },
      { type: "image", url: "obsidian-embed:wappen.png", alt: "wappen.png" },
      { type: "text", value: "." },
    ]);
  });

  it("marks callouts with their type and title", () => {
    const tree = run({
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  value: "[!warning] Falle\nDer Boden gibt nach.",
                },
              ],
            },
          ],
        },
      ],
    });
    const quote = tree.children?.[0];
    expect(quote?.data).toMatchObject({
      hName: "div",
      hProperties: { className: ["dm-callout", "dm-callout-warning"] },
    });
    expect(quote?.children?.[0]).toMatchObject({
      type: "paragraph",
      data: { hProperties: { className: ["dm-callout-title"] } },
      children: [{ type: "text", value: "Falle" }],
    });
    expect(quote?.children?.[1]?.children?.[0]?.value).toBe(
      "Der Boden gibt nach.",
    );
  });
});
