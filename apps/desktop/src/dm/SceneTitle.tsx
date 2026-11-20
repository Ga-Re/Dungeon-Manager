import { IconButton } from "@dungeon-manager/ui";
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Redo2,
  Tv,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** One open scene's tab (T-223a). */
export interface SceneTabEntry {
  readonly id: string;
  readonly name: string;
  /** It is the scene on the TV. */
  readonly onTv: boolean;
}

/**
 * The open scenes as tabs in the title bar (T-223a, ADR-0017): the shown one is marked current,
 * the one on the TV carries a TV mark. Switching tabs never changes the TV (DM decision,
 * 2026-11-20). Buttons, so the keyboard reaches each tab and its ✕ with Tab.
 */
export function SceneTabs({
  tabs,
  activeId,
  busy,
  focus = null,
  onFocused,
  onSelect,
  onClose,
}: {
  readonly tabs: readonly SceneTabEntry[];
  readonly activeId: string | null;
  /**
   * The shown scene is busy (its map changes or it is being deleted): it must not close, and
   * the DM stays on it until it is done.
   */
  readonly busy: boolean;
  /**
   * The tab to put keyboard focus on (after switching or closing: the tab bar moves with the
   * shown scene, so the button that had focus is gone). `onFocused` clears the request.
   */
  readonly focus?: string | null;
  readonly onFocused?: () => void;
  readonly onSelect: (id: string) => void;
  readonly onClose: (id: string) => void;
}) {
  const { t } = useTranslation();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (focus === null) return;
    buttons.current.get(focus)?.focus();
    onFocused?.();
  }, [focus, onFocused]);
  return (
    <span
      role="group"
      aria-label={t("campaign.openScenes")}
      className="dm-scene-tabs"
    >
      {tabs.map((tab) => {
        const current = tab.id === activeId;
        return (
          <span
            key={tab.id}
            className="dm-scene-tab"
            data-current={current ? "true" : undefined}
          >
            <button
              ref={(element) => {
                if (element) buttons.current.set(tab.id, element);
                else buttons.current.delete(tab.id);
              }}
              type="button"
              className="dm-scene-tab-name"
              aria-current={current ? "true" : undefined}
              disabled={busy && !current}
              onClick={() => {
                onSelect(tab.id);
              }}
            >
              {tab.name}
              {tab.onTv && (
                <>
                  <Tv aria-hidden="true" className="dm-scene-tab-tv" />
                  <span className="visually-hidden">
                    {t("campaign.sceneOnTv")}
                  </span>
                </>
              )}
            </button>
            <IconButton
              icon={<X />}
              label={t("campaign.closeSceneNamed", { name: tab.name })}
              disabled={current && busy}
              onClick={() => {
                onClose(tab.id);
              }}
            />
          </span>
        );
      })}
    </span>
  );
}

/**
 * The open scene's part of the title bar: undo/redo, the scene tabs and the save status. Scenes save
 * on every change, so there is a status instead of a save button (DM decision, T-130).
 */
export function SceneTitle({
  tabs,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saving,
  saveFailed,
  onRetrySave,
}: {
  /** The open scenes' tabs ({@link SceneTabs}). */
  readonly tabs: ReactNode;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  /** A write is still pending; wins over "saved" but not over a failure. */
  readonly saving: boolean;
  readonly saveFailed: boolean;
  readonly onRetrySave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <IconButton
        icon={<Undo2 />}
        label={t("fog.undo")}
        disabled={!canUndo}
        onClick={onUndo}
      />
      <IconButton
        icon={<Redo2 />}
        label={t("fog.redo")}
        disabled={!canRedo}
        onClick={onRedo}
      />
      {tabs}
      {saveFailed ? (
        <span
          role="alert"
          className="dm-save-status dm-save-status-failed"
          title={t("fog.saveFailed")}
        >
          <CircleAlert aria-hidden="true" />
          <span aria-hidden="true">{t("shell.save.failed")}</span>
          <span className="visually-hidden">{t("fog.saveFailed")}</span>
          <button type="button" onClick={onRetrySave}>
            {t("fog.retrySave")}
          </button>
        </span>
      ) : saving ? (
        <span className="dm-save-status">
          <LoaderCircle aria-hidden="true" />
          {t("shell.save.saving")}
        </span>
      ) : (
        <span className="dm-save-status">
          <CircleCheck aria-hidden="true" />
          {t("shell.save.saved")}
        </span>
      )}
    </>
  );
}
