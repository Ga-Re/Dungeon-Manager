import { useEffect, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import {
  findByName,
  remarkObsidian,
  resolveRelative,
  splitFrontMatter,
  urlTransform,
} from "./note-markdown.js";

/** Where a note points, resolved against the campaign folder. */
type Target =
  | { readonly kind: "local"; readonly path: string }
  | { readonly kind: "external"; readonly url: string }
  | { readonly kind: "none" };

/**
 * A note rendered as Markdown (T-163): GitHub-flavoured Markdown plus Obsidian's wiki links,
 * embeds and callouts, front matter as a properties table. Raw HTML in notes is never rendered
 * and links never navigate the window: note links open the note, external links only show
 * their address. Images come from the campaign folder through the DM-only image command;
 * external images load on request.
 */
export function NoteView({
  text,
  notePath,
  slug,
  service,
  files,
  onOpenNote,
}: {
  readonly text: string;
  /** The note's path relative to the campaign folder. */
  readonly notePath: string;
  readonly slug: string;
  readonly service: LibraryService;
  /** The campaign's files (relative paths), to find Obsidian targets by name. */
  readonly files: readonly string[];
  readonly onOpenNote: (path: string) => void;
}) {
  const { t } = useTranslation();
  const { properties, body } = splitFrontMatter(text);

  const resolve = (url: string | undefined, extension: string): Target => {
    if (!url) return { kind: "none" };
    if (url.startsWith("https://")) return { kind: "external", url };
    const prefixed = /^(note-link|obsidian-embed):(.*)$/.exec(url);
    const path = prefixed
      ? findByName(
          files,
          notePath,
          decodeURIComponent(prefixed[2] ?? ""),
          extension,
        )
      : resolveRelative(notePath, url);
    return path ? { kind: "local", path } : { kind: "none" };
  };

  return (
    <div className="dm-note">
      {properties.length > 0 && (
        <dl className="dm-note-properties">
          {properties.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Markdown
        remarkPlugins={[remarkGfm, remarkObsidian as never]}
        urlTransform={urlTransform}
        skipHtml
        components={{
          img: ({ src, alt }) => (
            <NoteImage
              target={resolve(typeof src === "string" ? src : undefined, "")}
              alt={alt ?? ""}
              slug={slug}
              service={service}
            />
          ),
          a: ({ href, children }) => {
            const target = resolve(href, ".md");
            if (target.kind === "local" && target.path.endsWith(".md"))
              return (
                <button
                  type="button"
                  className="dm-note-link"
                  onClick={() => {
                    onOpenNote(target.path);
                  }}
                >
                  {children}
                </button>
              );
            if (target.kind === "external")
              // Shown, not followed: a click must not navigate the DM window away.
              return (
                <span className="dm-note-external" title={target.url}>
                  {children}
                  <span className="dm-note-url"> ({target.url})</span>
                </span>
              );
            return (
              <span className="dm-note-missing" title={t("note.missingLink")}>
                {children}
              </span>
            );
          },
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}

/** An image of a note: local ones load at once, external ones on request. */
function NoteImage({
  target,
  alt,
  slug,
  service,
}: {
  readonly target: Target;
  readonly alt: string;
  readonly slug: string;
  readonly service: LibraryService;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [externalAllowed, setExternalAllowed] = useState(false);
  const localPath = target.kind === "local" ? target.path : null;

  useEffect(() => {
    if (!localPath) return;
    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);
    service.readImage(`campaigns/${slug}/${localPath}`).then(
      (blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [localPath, slug, service]);

  const placeholder = (content: ReactNode) => (
    <span className="dm-note-image-placeholder">{content}</span>
  );
  if (target.kind === "none" || failed)
    return placeholder(t("note.imageMissing", { name: alt }));
  if (target.kind === "external")
    return externalAllowed ? (
      <img
        className="dm-note-image"
        src={target.url}
        alt={alt}
        referrerPolicy="no-referrer"
      />
    ) : (
      placeholder(
        <>
          <span title={target.url}>
            {t("note.externalImage", { name: alt })}
          </span>
          <button
            type="button"
            onClick={() => {
              setExternalAllowed(true);
            }}
          >
            {t("note.loadImage")}
          </button>
        </>,
      )
    );
  return url ? (
    <img className="dm-note-image" src={url} alt={alt} />
  ) : (
    placeholder(t("note.imageLoading"))
  );
}
