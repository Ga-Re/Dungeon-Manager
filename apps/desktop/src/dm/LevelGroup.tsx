import type { AssetRef, Level } from "@dungeon-manager/schema";
import { IconButton, Menu, Popover, RibbonGroup } from "@dungeon-manager/ui";
import { Tv } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fileName } from "./file-name.js";
import { NameForm } from "./NameForm.js";

/** A file the DM picked for a new level, or why it does not fit the map. */
export type LevelFile =
  | { readonly kind: "fits"; readonly asset: AssetRef }
  | { readonly kind: "refused"; readonly message: string };

/**
 * The level the DM works on and the one the TV shows (T-118c), kept apart (DM decision,
 * 2026-11-20): the DM can prepare a level's fog in secret and show it when the group gets there.
 * Switching levels needs more than one level; adding and renaming them (T-118d) is always in the
 * group's menu.
 */
export function LevelGroup({
  levels,
  working,
  onTv,
  disabled,
  canEdit,
  onWork,
  onShow,
  onChooseFile,
  onAdd,
  onRename,
}: {
  readonly levels: readonly Level[];
  /** The level the DM works on (fog tools, map image). */
  readonly working: string;
  /** The level on the TV. */
  readonly onTv: string;
  readonly disabled: boolean;
  /** Whether the map's levels can be changed now (the scene plays the map's own data). */
  readonly canEdit: boolean;
  readonly onWork: (levelId: string) => void;
  /** Shows the working level on the TV (and releases it to the players). */
  readonly onShow: () => void;
  /** Asks for a level's own image or video and checks it against the map. */
  readonly onChooseFile: () => Promise<LevelFile | null>;
  /** Adds a level; resolves to whether it was added. */
  readonly onAdd: (name: string, asset: AssetRef | null) => Promise<boolean>;
  /** Renames the working level; resolves to whether it was renamed. */
  readonly onRename: (name: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<"add" | "rename" | null>(null);
  const [file, setFile] = useState<LevelFile | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const nameOf = (id: string) =>
    levels.find((level) => level.id === id)?.name ?? "";
  const close = () => {
    setEditing(null);
    setFile(null);
    menuButton.current?.focus();
  };
  const several = levels.length > 1;
  return (
    <RibbonGroup
      caption={t("level.group")}
      menu={{
        items: [
          {
            id: "add",
            label: t("level.add"),
            disabled: disabled || !canEdit,
          },
          {
            id: "rename",
            label: t("level.rename"),
            disabled: disabled || !canEdit,
          },
        ],
        onSelect: (id) => {
          setFile(null);
          setEditing(id === "add" ? "add" : "rename");
        },
        buttonRef: menuButton,
        onOpen: () => {
          setEditing(null);
        },
      }}
    >
      {several && (
        <>
          <Menu
            label={nameOf(working)}
            menuLabel={t("level.pick")}
            items={levels.map((level) => ({
              id: level.id,
              label: level.name,
              checked: level.id === working,
              ...(level.id === onTv && { icon: <Tv /> }),
            }))}
            onSelect={onWork}
          />
          <IconButton
            showLabel
            icon={<Tv />}
            label={t("level.showOnTv")}
            disabled={disabled || working === onTv}
            onClick={onShow}
          />
          <p className="dm-ribbon-meta">
            {t("level.onTv", { name: nameOf(onTv) })}
          </p>
        </>
      )}
      <Popover
        open={editing !== null}
        onClose={close}
        anchor={menuButton}
        label={editing === "add" ? t("level.add") : t("level.rename")}
        align="start"
      >
        {editing === "add" && (
          <>
            <p>
              <button
                type="button"
                onClick={() =>
                  void onChooseFile().then((chosen) => {
                    if (chosen) setFile(chosen);
                  })
                }
              >
                {t("level.chooseFile")}
              </button>
            </p>
            <p role={file?.kind === "refused" ? "alert" : "status"}>
              {file?.kind === "fits"
                ? t("level.ownFile", { file: fileName(file.asset.path) })
                : file?.kind === "refused"
                  ? file.message
                  : t("level.noOwnFile")}
            </p>
            <NameForm
              focusOnMount
              label={t("level.name")}
              submitLabel={t("level.create")}
              onSubmit={async (name) => {
                const added = await onAdd(
                  name,
                  file?.kind === "fits" ? file.asset : null,
                );
                if (added) close();
                return added;
              }}
            />
          </>
        )}
        {editing === "rename" && (
          <NameForm
            focusOnMount
            initial={nameOf(working)}
            label={t("level.name")}
            submitLabel={t("level.renameConfirm")}
            onSubmit={async (name) => {
              const renamed = await onRename(name);
              if (renamed) close();
              return renamed;
            }}
          />
        )}
      </Popover>
    </RibbonGroup>
  );
}
