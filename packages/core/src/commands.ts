import type {
  Combatant,
  GridCell,
  Polygon,
  Token,
  Visibility,
  VisibilityElementType,
} from "@dungeon-manager/schema";

/** Where a visibility setting applies: one token, or the campaign default for an element type. */
export type VisibilityTarget =
  | { readonly kind: "token"; readonly tokenId: string }
  | { readonly kind: "combatant"; readonly combatantId: string }
  | { readonly kind: "campaign" };

/** Everything that can change session state (ARCHITECTURE §5.1). */
export type Command =
  /** Puts a new token on the map (T-107a). */
  | { readonly type: "token.add"; readonly token: Token }
  | { readonly type: "token.remove"; readonly tokenId: string }
  | {
      readonly type: "token.move";
      readonly tokenId: string;
      readonly to: GridCell;
      readonly levelId?: string;
    }
  /** Reveal `area` (map pixels); clears memory fog there. */
  | {
      readonly type: "fog.reveal";
      readonly levelId: string;
      readonly area: Polygon;
    }
  /** Hide `area`; with `remember`, the part that was revealed becomes memory fog. */
  | {
      readonly type: "fog.hide";
      readonly levelId: string;
      readonly area: Polygon;
      readonly remember: boolean;
    }
  /** Set a visibility, or `null` to inherit again. */
  | {
      readonly type: "visibility.set";
      readonly target: VisibilityTarget;
      readonly elementType: VisibilityElementType;
      readonly visibility: Visibility | null;
    }
  /** Shows `levelId` on the TV; from then on players may see it (released). */
  | { readonly type: "level.show"; readonly levelId: string }
  | { readonly type: "initiative.add"; readonly combatant: Combatant }
  | { readonly type: "initiative.remove"; readonly combatantId: string }
  /** Ends the current turn; starts round 1 if combat has not started. */
  | { readonly type: "initiative.next" }
  /** Negative `amount` is damage (temporary HP first), positive is healing (up to max). */
  | {
      readonly type: "hp.change";
      readonly combatantId: string;
      readonly amount: number;
    }
  | {
      readonly type: "hp.setTemp";
      readonly combatantId: string;
      readonly temp: number;
    };

/** What happened, for the session log (ARCHITECTURE §5.1). `at` comes from the injected clock. */
export type DomainEvent = { readonly at: number } & (
  | { readonly type: "token.added"; readonly tokenId: string }
  | { readonly type: "token.removed"; readonly tokenId: string }
  | {
      readonly type: "token.moved";
      readonly tokenId: string;
      readonly from: GridCell;
      readonly to: GridCell;
      readonly levelId: string;
    }
  | { readonly type: "fog.revealed"; readonly levelId: string }
  | { readonly type: "fog.hidden"; readonly levelId: string }
  | { readonly type: "level.shown"; readonly levelId: string }
  | {
      readonly type: "visibility.changed";
      readonly target: VisibilityTarget;
      readonly elementType: VisibilityElementType;
      readonly visibility: Visibility | null;
    }
  | { readonly type: "initiative.combatantAdded"; readonly combatantId: string }
  | {
      readonly type: "initiative.combatantRemoved";
      readonly combatantId: string;
    }
  | {
      readonly type: "initiative.turnStarted";
      readonly round: number;
      readonly combatantId: string;
    }
  | {
      readonly type: "hp.changed";
      readonly combatantId: string;
      readonly current: number;
      readonly temp: number;
    }
);

/** Why a command was not applied; the UI translates the reason. */
export type RejectionReason =
  | "unknownToken"
  | "duplicateToken"
  | "unknownLevel"
  | "noMap"
  | "unknownCombatant"
  | "duplicateCombatant"
  | "noInitiative"
  | "emptyInitiative"
  | "hpNotTracked"
  | "invalidAmount"
  | "invalidArea"
  | "invalidCell";
