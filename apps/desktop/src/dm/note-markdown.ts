// Notes as Markdown (T-163): front matter, Obsidian syntax and the paths and urls a note may
// use. Pure; `NoteView` renders with react-markdown on top of this.

/** A note split into its front matter (flat `key: value` pairs) and its Markdown body. */
export interface SplitNote {
  readonly properties: readonly (readonly [string, string])[];
  readonly body: string;
}

const unquote = (value: string) =>
  /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;

/**
 * Splits off a YAML front matter head (`---` … `---` at the very start). Only flat keys are
 * shown; a key followed by `- item` lines gets them joined. A head without its closing line is
 * left in the body, as Obsidian does.
 */
export function splitFrontMatter(text: string): SplitNote {
  // A byte order mark (some editors on Windows) must not hide the head.
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const match = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(
    source,
  );
  if (!match) return { properties: [], body: text };
  const properties: [string, string][] = [];
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const pair = /^([^\s:#][^:]*):\s*(.*)$/.exec(line);
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (pair)
      properties.push([pair[1]?.trim() ?? "", unquote(pair[2]?.trim() ?? "")]);
    else if (item && properties.length > 0) {
      const last = properties[properties.length - 1] as [string, string];
      const value = unquote(item[1]?.trim() ?? "");
      last[1] = last[1] === "" ? value : `${last[1]}, ${value}`;
    }
  }
  return { properties, body: source.slice(match[0].length) };
}

/**
 * A path written in a note, relative to the note's folder, as a path relative to the campaign
 * folder; `null` if it is absolute or would leave the campaign folder.
 */
export function resolveRelative(
  notePath: string,
  target: string,
): string | null {
  let decoded: string;
  try {
    // A heading or block anchor (`other.md#Kapitel`) or a query does not change the file.
    decoded = decodeURIComponent(target.replace(/[#?].*$/, ""));
  } catch {
    return null;
  }
  if (decoded.startsWith("/") || decoded.includes("\\")) return null;
  const parts = notePath.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length > 0 ? parts.join("/") : null;
}

/**
 * Finds an Obsidian target (`[[Strahd]]`, `![[wappen.png]]`) among the campaign's files by
 * name, as Obsidian does: a target with a folder must match its end; otherwise a file next to
 * the note wins, then the shortest path. `extension` is added when the target has none.
 */
export function findByName(
  files: readonly string[],
  notePath: string,
  target: string,
  extension: string,
): string | null {
  const wanted = (
    /\.[A-Za-z0-9]+$/.test(target) ? target : `${target}${extension}`
  ).normalize("NFC");
  const candidates = files.filter((file) => {
    const normal = file.normalize("NFC");
    return normal === wanted || normal.endsWith(`/${wanted}`);
  });
  if (candidates.length === 0) return null;
  const folder = notePath.split("/").slice(0, -1).join("/");
  const near = candidates.find(
    (file) => file.split("/").slice(0, -1).join("/") === folder,
  );
  return near ?? [...candidates].sort((a, b) => a.length - b.length)[0] ?? null;
}

/**
 * The urls a note may use (react-markdown's `urlTransform`): note links and embeds produced by
 * `remarkObsidian`, relative paths, and https. Everything else (javascript:, data:, file:,
 * plain http, other schemes) is dropped, so nothing in a note runs code or reads local files.
 */
export function urlTransform(url: string): string {
  if (/^(note-link|obsidian-embed):/.test(url)) return url;
  if (/^https:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return "";
  return url;
}

/** The parts of a Markdown syntax tree this plugin reads and writes. */
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

const WIKI = /(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;

/** `[[Note|alias]]` and `![[file]]` in a text node, as text, link and image nodes. */
function splitWikiLinks(value: string): MdNode[] {
  const nodes: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(WIKI)) {
    const [whole, bang, rawTarget, alias] = match;
    const start = match.index;
    if (start > last)
      nodes.push({ type: "text", value: value.slice(last, start) });
    const target = (rawTarget ?? "").trim();
    const url = encodeURIComponent(target);
    nodes.push(
      bang
        ? { type: "image", url: `obsidian-embed:${url}`, alt: alias ?? target }
        : {
            type: "link",
            url: `note-link:${url}`,
            children: [{ type: "text", value: alias ?? target }],
          },
    );
    last = start + whole.length;
  }
  if (last < value.length)
    nodes.push({ type: "text", value: value.slice(last) });
  return nodes;
}

/** `> [!type] title` blockquotes become callout boxes with their title on top. */
function markCallout(quote: MdNode): void {
  const first = quote.children?.[0];
  const text = first?.type === "paragraph" ? first.children?.[0] : undefined;
  const marker =
    text?.type === "text"
      ? /^\[!(\w+)\][+-]?[ \t]*([^\n]*)\n?/.exec(text.value ?? "")
      : null;
  if (!first || !text || !marker) return;
  const type = (marker[1] ?? "note").toLowerCase();
  quote.data = {
    hName: "div",
    hProperties: { className: ["dm-callout", `dm-callout-${type}`] },
  };
  text.value = (text.value ?? "").slice(marker[0].length);
  const title: MdNode = {
    type: "paragraph",
    data: { hProperties: { className: ["dm-callout-title"] } },
    children: [{ type: "text", value: marker[2]?.trim() || type }],
  };
  // The rest of the first paragraph stays as the callout's first line of content.
  if (text.value === "" && (first.children?.length ?? 0) === 1)
    quote.children?.shift();
  quote.children?.unshift(title);
}

/** A remark plugin for Obsidian's wiki links, embeds and callouts (T-163). */
export function remarkObsidian() {
  const walk = (node: MdNode): void => {
    if (node.type === "blockquote") markCallout(node);
    if (!node.children) return;
    node.children = node.children.flatMap((child) =>
      child.type === "text" && child.value?.includes("[[")
        ? splitWikiLinks(child.value)
        : [child],
    );
    // Not inside code: its text stays as written.
    for (const child of node.children)
      if (child.type !== "code" && child.type !== "inlineCode") walk(child);
  };
  return (tree: MdNode) => {
    walk(tree);
  };
}
