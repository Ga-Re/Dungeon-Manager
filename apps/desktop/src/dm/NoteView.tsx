import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { LibraryError, type LibraryService } from "../platform/library.js";
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

/** What the image and link components of a note need; read from context. */
interface NoteContextValue {
  readonly resolve: (url: string | undefined, extension: string) => Target;
  readonly slug: string;
  readonly service: LibraryService;
  readonly openNote: (path: string) => void;
}

const NoteContext = createContext<NoteContextValue | null>(null);

function useNote(): NoteContextValue {
  const value = useContext(NoteContext);
  if (!value) throw new Error("Note parts render only inside NoteView");
  return value;
}

/** `decodeURIComponent`, or `null` for a malformed escape written in a note. */
function decode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/**
 * The components react-markdown renders images and links with. Defined once: react-markdown
 * uses them as element types, so a new function per render would remount every image (and
 * fetch it again).
 */
const COMPONENTS: Components = {
  img: ({ src, alt }) => (
    <NoteImage
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
    />
  ),
  a: ({ href, children }) => <NoteLink href={href}>{children}</NoteLink>,
};

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
  const { properties, body } = splitFrontMatter(text);
  // The latest callback without changing the context on every parent render.
  const openNote = useRef(onOpenNote);
  useEffect(() => {
    openNote.current = onOpenNote;
  });

  const context = useMemo<NoteContextValue>(
    () => ({
      resolve: (url, extension) => {
        if (!url) return { kind: "none" };
        if (url.startsWith("https://")) return { kind: "external", url };
        const prefixed = /^(note-link|obsidian-embed):(.*)$/.exec(url);
        const target = prefixed ? decode(prefixed[2] ?? "") : null;
        const path = prefixed
          ? target && findByName(files, notePath, target, extension)
          : resolveRelative(notePath, url);
        return path ? { kind: "local", path } : { kind: "none" };
      },
      slug,
      service,
      openNote: (path) => {
        openNote.current(path);
      },
    }),
    [files, notePath, slug, service],
  );

  return (
    <NoteContext value={context}>
      <div className="dm-note">
        {properties.length > 0 && (
          <dl className="dm-note-properties">
            {properties.map(([key, value], index) => (
              // Keys may repeat in a hand-written head.
              <div key={`${String(index)}-${key}`}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <Markdown
          // remarkObsidian works on the mdast tree; its own minimal node type keeps the
          // unified types (not a direct dependency) out of this package.
          remarkPlugins={[remarkGfm, remarkObsidian as never]}
          urlTransform={urlTransform}
          skipHtml
          components={COMPONENTS}
        >
          {body}
        </Markdown>
      </div>
    </NoteContext>
  );
}

/** A link of a note: note links open the note; nothing ever navigates the window. */
function NoteLink({
  href,
  children,
}: {
  readonly href: string | undefined;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  const { resolve, openNote } = useNote();
  const target = resolve(href, ".md");
  if (target.kind === "local" && target.path.endsWith(".md"))
    return (
      <button
        type="button"
        className="dm-note-link"
        onClick={() => {
          openNote(target.path);
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
}

/** Why a local image could not be shown. */
type ImageProblem = "missing" | "tooLarge" | "notImage";

function imageProblem(error: unknown): ImageProblem {
  if (error instanceof LibraryError && error.code === "unsupportedFile")
    return error.message.includes("too large") ? "tooLarge" : "notImage";
  return "missing";
}

/** An image of a note: local ones load at once, external ones on request. */
function NoteImage({
  src,
  alt,
}: {
  readonly src: string | undefined;
  readonly alt: string;
}) {
  const { t } = useTranslation();
  const { resolve, slug, service } = useNote();
  const target = resolve(src, "");
  const [url, setUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<ImageProblem | null>(null);
  const [externalAllowed, setExternalAllowed] = useState(false);
  const localPath = target.kind === "local" ? target.path : null;

  useEffect(() => {
    if (!localPath) return;
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setProblem(null);
    service.readImage(`campaigns/${slug}/${localPath}`).then(
      (blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      (error: unknown) => {
        if (active) setProblem(imageProblem(error));
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
  if (target.kind === "none")
    return placeholder(t("note.imageMissing", { name: alt }));
  if (problem)
    return placeholder(
      t(
        problem === "tooLarge"
          ? "note.imageTooLarge"
          : problem === "notImage"
            ? "note.imageNotSupported"
            : "note.imageMissing",
        { name: alt },
      ),
    );
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
