import { FOG_BIOMES, type FogEffect } from "@dungeon-manager/schema";
import { IconButton, Menu, RibbonGroup } from "@dungeon-manager/ui";
import { useState } from "react";
import {
  Brush,
  Circle,
  CloudFog,
  Lasso,
  Eye,
  EyeOff,
  Hand,
  Pentagon,
  ScanEye,
  Square,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FOG_SPEED, speedOfStep, stepOfSpeed } from "../fog-settings.js";
import { SHAPE_KEYS, type FogShape } from "./fog-shapes.js";
import type { MapTool } from "./MapView.js";

const TOOLS: readonly { id: MapTool; icon: ReactNode }[] = [
  { id: "pan", icon: <Hand /> },
  { id: "reveal", icon: <Eye /> },
  { id: "hide", icon: <EyeOff /> },
];
const SHAPES: readonly { id: FogShape; icon: ReactNode }[] = [
  { id: "rectangle", icon: <Square /> },
  { id: "ellipse", icon: <Circle /> },
  { id: "polygon", icon: <Pentagon /> },
  { id: "lasso", icon: <Lasso /> },
  { id: "brush", icon: <Brush /> },
];

/**
 * Fog tools for the open scene (SPEC 4) as ribbon groups (T-131): what dragging on the map
 * does, its shape, and the whole map at once (undo/redo are in the title bar). The active tool
 * and shape are pressed toggle buttons; Tab moves between them.
 */
export function FogToolbar({
  tool,
  onTool,
  shape,
  onShape,
  brushCells,
  onBrushCells,
  disabled,
  onRevealAll,
  onCoverAll,
  speed,
  onSpeed,
  fogEffect,
  ownFogEffect,
  onFogEffect,
}: {
  readonly tool: MapTool;
  readonly onTool: (tool: MapTool) => void;
  readonly shape: FogShape;
  readonly onShape: (shape: FogShape) => void;
  /** Brush diameter in grid cells. */
  readonly brushCells: number;
  readonly onBrushCells: (cells: number) => void;
  /** No map (or not loaded yet), or the campaign is unreadable: nothing to edit. */
  readonly disabled: boolean;
  readonly onRevealAll: () => void;
  readonly onCoverAll: () => void;
  /** How fast fog changes spread, in grid cells per second; `Infinity` is "Sofort" (T-246). */
  readonly speed: number;
  readonly onSpeed: (speed: number) => void;
  /** The fog's biome as played (T-168): the scene's own choice, else its map's; none: Bodennebel. */
  readonly fogEffect: FogEffect | null;
  /** Whether the scene has chosen its own biome (else it follows the map). */
  readonly ownFogEffect: boolean;
  /** Choose the scene's biome live; `null` follows the map again. */
  readonly onFogEffect: (effect: FogEffect | null) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <>
      <RibbonGroup caption={t("fog.tool")}>
        {TOOLS.map((each) => (
          <IconButton
            key={each.id}
            showLabel
            icon={each.icon}
            label={t(`fog.tools.${each.id}`)}
            pressed={tool === each.id}
            disabled={disabled}
            onClick={() => {
              onTool(each.id);
            }}
          />
        ))}
      </RibbonGroup>
      <RibbonGroup caption={t("fog.shape")}>
        {SHAPES.map((each) => (
          <IconButton
            key={each.id}
            showLabel
            icon={each.icon}
            label={t(`fog.shapes.${each.id}`)}
            aria-keyshortcuts={SHAPE_KEYS[each.id]}
            pressed={shape === each.id}
            disabled={disabled || tool === "pan"}
            onClick={() => {
              onShape(each.id);
            }}
          />
        ))}
        {shape === "brush" && (
          <label className="dm-ribbon-field">
            {t("fog.brushSize", {
              count: brushCells,
              cells: brushCells.toLocaleString(i18n.language),
            })}
            <input
              type="range"
              min={0.5}
              max={6}
              step={0.5}
              value={brushCells}
              disabled={disabled || tool === "pan"}
              onChange={(event) => {
                onBrushCells(Number(event.target.value));
              }}
            />
          </label>
        )}
      </RibbonGroup>
      <RibbonGroup caption={t("fog.spread")}>
        <label className="dm-ribbon-field">
          {Number.isFinite(speed)
            ? t("fog.speed", { cells: speed.toLocaleString(i18n.language) })
            : t("fog.speedInstant")}
          <input
            type="range"
            min={0}
            max={FOG_SPEED.steps}
            step={1}
            value={stepOfSpeed(speed)}
            aria-valuetext={
              Number.isFinite(speed)
                ? t("fog.speedValue", {
                    cells: speed.toLocaleString(i18n.language),
                  })
                : t("fog.speedInstantValue")
            }
            onChange={(event) => {
              onSpeed(speedOfStep(Number(event.target.value)));
            }}
          />
        </label>
      </RibbonGroup>
      <BiomeGroup
        disabled={disabled}
        fogEffect={fogEffect}
        ownFogEffect={ownFogEffect}
        onFogEffect={onFogEffect}
      />
      <RibbonGroup caption={t("fog.wholeMap")}>
        <IconButton
          showLabel
          icon={<ScanEye />}
          label={t("fog.revealAll")}
          disabled={disabled}
          onClick={onRevealAll}
        />
        <IconButton
          showLabel
          icon={<CloudFog />}
          label={t("fog.coverAll")}
          disabled={disabled}
          onClick={onCoverAll}
        />
      </RibbonGroup>
    </>
  );
}

/**
 * The fog's biome and its strength (T-168), chosen live for the open scene. The strength is
 * applied when the slider is let go, so dragging it makes one undo step.
 */
function BiomeGroup({
  disabled,
  fogEffect,
  ownFogEffect,
  onFogEffect,
}: {
  readonly disabled: boolean;
  readonly fogEffect: FogEffect | null;
  readonly ownFogEffect: boolean;
  readonly onFogEffect: (effect: FogEffect | null) => void;
}) {
  const { t } = useTranslation();
  const biome = fogEffect?.biome ?? "nebel";
  const known = FOG_BIOMES.find((each) => each === biome);
  const strength = fogEffect?.strength ?? 1;
  // While dragging: shown, not yet applied.
  const [dragged, setDragged] = useState<number | null>(null);
  const shown = dragged ?? strength;
  const commit = () => {
    if (dragged === null) return;
    setDragged(null);
    if (dragged !== strength) onFogEffect({ biome, strength: dragged });
  };
  return (
    <RibbonGroup caption={t("fog.biome")}>
      <Menu
        label={known ? t(`fog.biomes.${known}`) : biome}
        menuLabel={t("fog.biomePick")}
        items={[
          {
            id: "map",
            label: t("fog.biomeAsMap"),
            checked: !ownFogEffect,
          },
          ...FOG_BIOMES.map((each) => ({
            id: each,
            label: t(`fog.biomes.${each}`),
            checked: ownFogEffect && biome === each,
          })),
        ]}
        onSelect={(id) => {
          const chosen = FOG_BIOMES.find((each) => each === id);
          onFogEffect(chosen ? { biome: chosen, strength } : null);
        }}
      />
      <div className="dm-ribbon-field">
        <span aria-hidden="true">
          {t("fog.strength", { percent: Math.round(shown * 100) })}
        </span>
        <input
          type="range"
          aria-label={t("fog.strengthName")}
          aria-valuetext={t("fog.strengthValue", {
            percent: Math.round(shown * 100),
          })}
          min={0}
          max={1}
          step={0.1}
          value={shown}
          disabled={disabled}
          onChange={(event) => {
            setDragged(Number(event.target.value));
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      </div>
    </RibbonGroup>
  );
}
