import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/** One entry of a {@link TreeList}. A node with `children` (even empty) is a folder. Ids are unique per tree. */
export interface TreeNode {
  id: string;
  /** Translated, user-visible name. */
  label: string;
  /** Decorative icon in front of the label. */
  icon?: ReactNode;
  /** Show the label in the monospace face (file names, technical values). */
  mono?: boolean | undefined;
  /** Small trailing info such as a badge ("4K", "geheim") or a role marker. */
  meta?: ReactNode;
  children?: readonly TreeNode[] | undefined;
}

/** Props of {@link TreeList}. */
export interface TreeListProps {
  /** Translated accessible name of the tree. */
  label: string;
  nodes: readonly TreeNode[];
  selectedId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
  /**
   * Expanded folders when controlled. Leave out to let the tree manage it: then every folder,
   * including ones added later, is expanded until the DM collapses it.
   */
  expandedIds?: ReadonlySet<string> | undefined;
  onExpandedChange?: ((ids: ReadonlySet<string>) => void) | undefined;
  /**
   * Trailing actions of an item (e.g. visibility toggle, remove). They are pointer shortcuts:
   * clicks on them never select the item. Give them `tabIndex={-1}` so the tree keeps a single
   * tab stop, and offer the same actions to keyboard users elsewhere (e.g. the ribbon).
   */
  renderActions?: ((node: TreeNode) => ReactNode) | undefined;
  /**
   * Right-click on an item, or Shift+F10 / the context-menu key on the focused one. `point` is
   * where to open the menu (the pointer, or below the item's row); `item` gets focus back.
   */
  onItemContextMenu?:
    | ((id: string, point: { x: number; y: number }, item: HTMLElement) => void)
    | undefined;
  /**
   * `guides`: outline tree with connector lines, junction dots and toggle boxes. `compact`: CAD
   * browser style with disclosure chevrons and no lines, for tool windows over the map.
   */
  variant?: "guides" | "compact" | undefined;
  className?: string | undefined;
}

interface TreeIndex {
  /** Position of every node in document order, used for stable label ids. */
  order: Map<string, number>;
  parent: Map<string, string | null>;
  folders: string[];
}

function indexTree(nodes: readonly TreeNode[]): TreeIndex {
  const index: TreeIndex = { order: new Map(), parent: new Map(), folders: [] };
  const visit = (list: readonly TreeNode[], parentId: string | null) => {
    for (const node of list) {
      index.order.set(node.id, index.order.size);
      index.parent.set(node.id, parentId);
      if (node.children) {
        index.folders.push(node.id);
        visit(node.children, node.id);
      }
    }
  };
  visit(nodes, null);
  return index;
}

function visibleIds(
  nodes: readonly TreeNode[],
  expanded: ReadonlySet<string>,
): string[] {
  return nodes.flatMap((node) => [
    node.id,
    ...(node.children && expanded.has(node.id)
      ? visibleIds(node.children, expanded)
      : []),
  ]);
}

/**
 * Outline tree with connector lines, junction dots and toggle boxes (ADR-0011).
 * Keyboard support follows the WAI-ARIA tree pattern: arrow keys, Home/End, Enter/Space,
 * with a single (roving) tab stop.
 */
export function TreeList({
  label,
  nodes,
  selectedId = null,
  onSelect,
  expandedIds,
  onExpandedChange,
  renderActions,
  onItemContextMenu,
  variant = "guides",
  className,
}: TreeListProps) {
  const idPrefix = useId();
  // Uncontrolled mode remembers what was collapsed, so new folders start expanded.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const elements = useRef(new Map<string, HTMLLIElement>());
  // When the context-menu key last opened a menu: its own `contextmenu` event follows shortly
  // after on some platforms, none on others, so only a recent one is swallowed.
  const openedByKey = useRef(Number.NEGATIVE_INFINITY);

  const tree = useMemo(() => indexTree(nodes), [nodes]);
  const expanded = useMemo(
    () =>
      expandedIds ?? new Set(tree.folders.filter((id) => !collapsed.has(id))),
    [expandedIds, tree, collapsed],
  );
  const visible = useMemo(() => visibleIds(nodes, expanded), [nodes, expanded]);
  const position = useMemo(
    () => new Map(visible.map((id, index) => [id, index])),
    [visible],
  );

  const isVisible = (id: string | null): id is string =>
    id !== null && position.has(id);
  // Roving tab stop: the focused item, else the selected one, else the first.
  const tabStop = isVisible(focusedId)
    ? focusedId
    : isVisible(selectedId)
      ? selectedId
      : (visible[0] ?? null);

  function moveFocus(id: string) {
    setFocusedId(id);
    elements.current.get(id)?.focus();
  }

  function setExpanded(id: string, open: boolean) {
    const next = new Set(expanded);
    if (open) next.add(id);
    else next.delete(id);
    if (!expandedIds) {
      const nextCollapsed = new Set(collapsed);
      if (open) nextCollapsed.delete(id);
      else nextCollapsed.add(id);
      setCollapsed(nextCollapsed);
    }
    onExpandedChange?.(next);
    // Collapsing would unmount a focused descendant; keep focus on the folder instead.
    const folder = elements.current.get(id);
    const active = folder?.ownerDocument.activeElement;
    if (
      !open &&
      folder &&
      active &&
      active !== folder &&
      folder.contains(active)
    ) {
      moveFocus(id);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, node: TreeNode) {
    // Items are nested, so ignore key presses bubbling up from a child item.
    if (event.target !== event.currentTarget) return;
    if (
      onItemContextMenu &&
      (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
    ) {
      event.preventDefault();
      // Only the context-menu key fires a `contextmenu` event afterwards.
      openedByKey.current =
        event.key === "ContextMenu"
          ? event.timeStamp
          : Number.NEGATIVE_INFINITY;
      const row = event.currentTarget.querySelector(".dm-tree-row");
      const box = (row ?? event.currentTarget).getBoundingClientRect();
      onItemContextMenu(
        node.id,
        { x: box.left, y: box.bottom },
        event.currentTarget,
      );
      return;
    }
    const index = position.get(node.id) ?? 0;
    const isOpen = node.children !== undefined && expanded.has(node.id);
    let next: string | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = visible[index + 1];
        break;
      case "ArrowUp":
        next = visible[index - 1];
        break;
      case "Home":
        next = visible[0];
        break;
      case "End":
        next = visible.at(-1);
        break;
      case "ArrowRight":
        if (node.children && !isOpen) setExpanded(node.id, true);
        else if (isOpen) next = node.children?.[0]?.id;
        break;
      case "ArrowLeft":
        if (isOpen) setExpanded(node.id, false);
        else next = tree.parent.get(node.id) ?? undefined;
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
      const isFolder = node.children !== undefined;
      const isOpen = isFolder && expanded.has(node.id);
      const labelId = `${idPrefix}-${String(tree.order.get(node.id))}`;
      const actions = renderActions?.(node);
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
            onKeyDown(event, node);
          }}
          // Right-click anywhere on the item line (rows can be narrower than the tree); clicks
          // inside nested items belong to them. The context-menu key also fires `contextmenu`
          // (on keyup in WebView2) after our menu opened on keydown: that one is only swallowed.
          onContextMenu={
            onItemContextMenu &&
            ((event) => {
              if (
                !(event.target instanceof Element) ||
                event.target.closest(".dm-tree-item") !== event.currentTarget
              )
                return;
              event.preventDefault();
              if (event.timeStamp - openedByKey.current < 1000) {
                openedByKey.current = Number.NEGATIVE_INFINITY;
                return;
              }
              moveFocus(node.id);
              onItemContextMenu(
                node.id,
                { x: event.clientX, y: event.clientY },
                event.currentTarget,
              );
            })
          }
          // The whole item line selects, also beside a row that is narrower than the tree; clicks
          // inside nested items belong to them.
          onClick={(event) => {
            if (
              !(event.target instanceof Element) ||
              event.target.closest(".dm-tree-item") !== event.currentTarget
            )
              return;
            moveFocus(node.id);
            onSelect?.(node.id);
          }}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocusedId(node.id);
          }}
        >
          <div className="dm-tree-row">
            {isFolder && (
              <span
                className="dm-tree-toggle"
                aria-hidden="true"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(node.id, !isOpen);
                }}
              >
                {variant === "compact" ? (
                  <svg viewBox="0 0 8 8">
                    <path
                      d={
                        isOpen
                          ? "M1.5 3l2.5 2.5 2.5-2.5"
                          : "M3 1.5l2.5 2.5-2.5 2.5"
                      }
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 8 8">
                    <path d="M1 4h6" />
                    {!isOpen && <path d="M4 1v6" />}
                  </svg>
                )}
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
            {actions !== undefined && actions !== null && (
              <span
                className="dm-tree-actions"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                {actions}
              </span>
            )}
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
      className={[
        "dm-tree",
        variant === "compact" ? "dm-tree-compact" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {renderItems(nodes, 1)}
    </ul>
  );
}
