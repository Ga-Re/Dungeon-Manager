import type {
  AssetRef,
  Creature,
  CreatureRef,
  Token,
} from "@dungeon-manager/schema";
import { gridFootprint, type GridFootprint } from "./footprint.js";

// A token's creature (T-180a, ADR-0018): the token keeps a reference and only its own values;
// look, footprint and stats come from the creature – or from its active shape. Pure: the caller
// looks creatures up (library or campaign). Runs on the host only: creatures never reach a viewer.

/** A token with what its creature gives it. */
export interface ResolvedTokenCreature {
  /** The creature (or active shape) found, else `null`. */
  readonly creature: Creature | null;
  /** The token names a creature that is not there (deleted, not synced yet): show a placeholder. */
  readonly missingCreature: boolean;
  /** The token's own picture, else the creature's; `null`: a placeholder picture. */
  readonly image: AssetRef | null;
  readonly footprint: GridFootprint;
}

/** Resolves `token`'s creature with `find`. */
export function resolveTokenCreature(
  token: Token,
  find: (ref: CreatureRef) => Creature | undefined,
): ResolvedTokenCreature {
  const ref = token.shape ?? token.creature;
  const creature = ref ? (find(ref) ?? null) : null;
  // The creature's own footprint applies while the token keeps the creature's size.
  const footprint = gridFootprint(
    token.size,
    creature && creature.size === token.size ? creature.footprint : undefined,
  );
  return {
    creature,
    missingCreature: ref !== undefined && creature === null,
    image: token.image ?? creature?.look.token ?? null,
    footprint,
  };
}
