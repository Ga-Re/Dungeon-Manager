import { IconButton } from "@dungeon-manager/ui";
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Redo2,
  Undo2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The open scene's part of the title bar: undo/redo, its tab and the save status. Scenes save
 * on every change, so there is a status instead of a save button (DM decision, T-130).
 */
export function SceneTitle({
  name,
  busy,
  onClose,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saving,
  saveFailed,
  onRetrySave,
}: {
  readonly name: string;
  readonly busy: boolean;
  readonly onClose: () => void;
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
      <span className="dm-scene-tab">
        <span className="dm-scene-tab-name">{name}</span>
        <IconButton
          icon={<X />}
          label={t("campaign.closeScene")}
          disabled={busy}
          onClick={onClose}
        />
      </span>
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
