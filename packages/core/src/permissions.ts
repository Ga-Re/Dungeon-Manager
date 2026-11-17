import type { Command } from "./commands.js";
import type { SessionState } from "./state.js";

/** Who sends a command (ARCHITECTURE §5.1). */
export type Actor =
  | { readonly kind: "dm" }
  /** The DM's phone acting as a remote: same rights as the DM. */
  | { readonly kind: "dmPhone" }
  | { readonly kind: "player"; readonly playerId: string };

/**
 * Whether `actor` may send `command`. The DM (and the DM phone) may do everything; a player may
 * only move a token they own on its current level (SPEC §2.4). DM locks and movement rules
 * (range, fog) follow with the companion (stage 3).
 */
export function canApply(
  actor: Actor,
  command: Command,
  state: SessionState,
): boolean {
  if (actor.kind !== "player") return true;
  if (!state.campaign.players.some((player) => player.id === actor.playerId))
    return false;
  if (command.type !== "token.move") return false;
  const token = state.scene.tokens.find(
    (candidate) => candidate.id === command.tokenId,
  );
  return (
    token?.ownerPlayerId === actor.playerId &&
    (command.levelId === undefined || command.levelId === token.levelId)
  );
}
