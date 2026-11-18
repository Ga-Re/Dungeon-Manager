import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/** One entry of a {@link TreeList}. A node with `children` (even empty) is a folder. */
export interface TreeNode {
  id: string;
  /** Translated, user-visible name. */
  label: string;
  /** Decorative icon in front of the label. */
  icon?: ReactNode;
  /** Show the label in the monospace face (file names, technical values). */
  mono?: boolean;
  /** Small trailing info such as a badge ("4K", "geheim") or a role marker. */
  meta?: ReactNode;
  children?: readonly TreeNode[];
}

/** Props of {@link TreeList}. */
export interface TreeListProps {
  /** Translated accessible name of the tree. */
  label: string;
  nodes: readonly TreeNode[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Expanded folders when controlled; leave out to let the tree manage it (all folders start expanded). */
  expandedIds?: ReadonlySet<string>;
  onExpandedChange?: (ids: ReadonlySet<string>) => void;
  /** Trailing actions of an item (e.g. visibility toggle, remove). */
  renderActions?: (node: TreeNode) => ReactNode;
  className?: string;
}

interface VisibleItem {
  node: TreeNode;
  parentId: string | null;
}

function folderIds(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children ? [node.id, ...folderIds(node.children)] : [],
  );
}

function visibleItems(
  nodes: readonly TreeNode[],
  expanded: ReadonlySet<string>,
  parentId: string | null = null,
): VisibleItem[] {
  return nodes.flatMap((node) => [
    { node, parentId },
    ...(node.children && expanded.has(node.id)
      ? visibleItems(node.children, expanded, node.id)
      : []),
  ]);
}

/**
 * Outline tree with connector lines, junction dots and toggle boxes (ADR-0011).
 * Keyboard support follows the WAI-ARIA tree pattern: arrow keys, Home/End, Enter/Space.
 */
export function TreeList({
  label,
  nodes,
  selectedId = null,
  onSelect,
  expandedIds,
  onExpandedChange,
  renderActions,
  className,
}: TreeListProps) {
  const idPrefix = useId();
  const [ownExpanded, setOwnExpanded] = useState<ReadonlySet<string>>(
    () => new Set(folderIds(nodes)),
  );
  const expanded = expandedIds ?? ownExpanded;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const elements = useRef(new Map<string, HTMLLIElement>());

  const visible = useMemo(
    () => visibleItems(nodes, expanded),
    [nodes, expanded],
  );
  const isVisible = (id: string | null) =>
    id !== null && visible.some((item) => item.node.id === id);
  // Roving tab stop: the focused item, else the selected one, else the first.
  const tabStop = isVisible(focusedId)
    ? focusedId
    : isVisible(selectedId)
      ? selectedId
      : (visible[0]?.node.id ?? null);

  function setExpanded(id: string, open: boolean) {
    const next = new Set(expanded);
    if (open) next.add(id);
    else next.delete(id);
    if (!expandedIds) setOwnExpanded(next);
    onExpandedChange?.(next);
  }

  function moveFocus(id: string) {
    setFocusedId(id);
    elements.current.get(id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, item: VisibleItem) {
    // Items are nested, so ignore key presses bubbling up from a child item.
    if (event.target !== event.currentTarget) return;
    const { node } = item;
    const index = visible.indexOf(item);
    const isOpen = node.children !== undefined && expanded.has(node.id);
    const target = (offset: number) => visible[index + offset]?.node.id;
    let next: string | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = target(1);
        break;
      case "ArrowUp":
        next = target(-1);
        break;
      case "Home":
        next = visible[0]?.node.id;
        break;
      case "End":
        next = visible.at(-1)?.node.id;
        break;
      case "ArrowRight":
        if (node.children && !isOpen) setExpanded(node.id, true);
        else if (isOpen) next = node.children?.[0]?.id;
        break;
      case "ArrowLeft":
        if (isOpen) setExpanded(node.id, false);
        else next = item.parentId ?? undefined;
        break;
      case "Enter":
      case " ":
        onSelect?.(node.id);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== undefined) moveFocus(next);
  }

  function renderItems(list: readonly TreeNode[], level: number): ReactNode {
    return list.map((node) => {
      const item = visible.find((entry) => entry.node === node);
      if (!item) return null;
      const isFolder = node.children !== undefined;
      const isOpen = isFolder && expanded.has(node.id);
      const labelId = `${idPrefix}-${String(visible.indexOf(item))}`;
      return (
        <li
          key={node.id}
          ref={(element) => {
            if (element) elements.current.set(node.id, element);
            else elements.current.delete(node.id);
          }}
          role="treeitem"
          className="dm-tree-item"
          data-id={node.id}
          aria-level={level}
          aria-expanded={isFolder ? isOpen : undefined}
          aria-selected={node.id === selectedId}
          aria-labelledby={labelId}
          tabIndex={node.id === tabStop ? 0 : -1}
          onKeyDown={(event) => {
            onKeyDown(event, item);
          }}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocusedId(node.id);
          }}
        >
          <div
            className="dm-tree-row"
            onClick={() => {
              moveFocus(node.id);
              onSelect?.(node.id);
            }}
          >
            {isFolder && (
              <span
                className="dm-tree-toggle"
                aria-hidden="true"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(node.id, !isOpen);
                }}
              >
                <svg viewBox="0 0 8 8">
                  <path d="M1 4h6" />
                  {!isOpen && <path d="M4 1v6" />}
                </svg>
              </span>
            )}
            {node.icon !== undefined && (
              <span className="dm-tree-icon" aria-hidden="true">
                {node.icon}
              </span>
            )}
            <span
              id={labelId}
              className={
                node.mono ? "dm-tree-label dm-tree-label-mono" : "dm-tree-label"
              }
            >
              {node.label}
            </span>
            {node.meta !== undefined && (
              <span className="dm-tree-meta">{node.meta}</span>
            )}
            {renderActions?.(node)}
          </div>
          {isOpen && node.children && node.children.length > 0 && (
            <ul role="group" className="dm-tree-group">
              {renderItems(node.children, level + 1)}
            </ul>
          )}
        </li>
      );
    });
  }

  return (
    <ul
      role="tree"
      aria-label={label}
      className={["dm-tree", className ?? ""].filter(Boolean).join(" ")}
    >
      {renderItems(nodes, 1)}
    </ul>
  );
}
