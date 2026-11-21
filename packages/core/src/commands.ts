import type {
  Combatant,
  GridMode,
  Polygon,
  TokenPosition,
  Token,
  Visibility,
  VisibilityElementType,
} from "@dungeon-manager/schema";
import type { CellBounds } from "./footprint.js";

/** Where a visibility setting applies: one token, or the campaign default for an element type. */
export type VisibilityTarget =
  | { readonly kind: "token"; readonly tokenId: string }
  | { readonly kind: "combatant"; readonly combatantId: string }
  | { readonly kind: "campaign" };

/** Everything that can change session state (ARCHITECTURE §5.1). */
export type Command =
  /** Puts a new token on the map (T-107a). */
  | { readonly type: "token.add"; readonly token: Token }
  /** Removes tokens, all in one step (T-107b: a selection). */
  | { readonly type: "token.remove"; readonly tokenIds: readonly string[] }
  /**
   * Moves several tokens at once, as one step (T-107b: a selection, a group). With `bounds` (the
   * map's whole cells) they go onto cells, a token whose cell is taken onto the nearest free one
   * (T-233c); with `free` too they stay where they are put, pushed just far enough off others
   * (T-233d); `free` without `bounds` (no map size known) takes the moves as they are. Rejected
   * if one finds no room.
   */
  | {
      readonly type: "token.moveMany";
      readonly moves: readonly {
        readonly tokenId: string;
        readonly to: TokenPosition;
      }[];
      readonly bounds?: Required<CellBounds>;
      readonly free?: boolean;
    }
  /** The scene's grid mode (T-233d); `null`: as the campaign's. */
  | { readonly type: "scene.setGridMode"; readonly gridMode: GridMode | null }
  | {
      readonly type: "token.move";
      readonly tokenId: string;
      readonly to: TokenPosition;
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
  /** `visibility.set` for several tokens at once, as one step (T-107b: hiding a selection). */
  | {
      readonly type: "visibility.setTokens";
      readonly tokenIds: readonly string[];
      readonly elementType: VisibilityElementType;
      readonly visibility: Visibility | null;
    }
  /** Shows `levelId` on the TV; from then on players may see it (released). */
  | { readonly type: "level.show"; readonly levelId: string }
  /**
   * Starts a combat (T-233): every token snaps to the nearest free cell inside `bounds` (the
   * map's whole cells), level by level, in one step. Rejected if a token finds no room.
   */
  | { readonly type: "combat.start"; readonly bounds: Required<CellBounds> }
  /** Ends the combat; tokens stay where they are. */
  | { readonly type: "combat.end" }
  | { readonly type: "initiative.add"; readonly combatant: Combatant }
  /** Adds several combatants as one step (T-111b: the selected tokens). */
  | {
      readonly type: "initiative.addMany";
      readonly combatants: readonly Combatant[];
    }
  /**
   * Starts the initiative (T-111): combat starts too – tokens snap onto cells inside `bounds` –
   * and the first combatant's turn begins in round 1. One step.
   */
  | { readonly type: "initiative.start"; readonly bounds: Required<CellBounds> }
  /** Ends the combat: the initiative is cleared and combat ends, as one step. */
  | { readonly type: "initiative.end" }
  /** The active combatant delays: it is skipped until it acts again (`initiative.actNow`). */
  | { readonly type: "initiative.delay"; readonly combatantId: string }
  /** A delayed combatant acts now: it moves before the active one and its turn starts. */
  | { readonly type: "initiative.actNow"; readonly combatantId: string }
  /** Marks a held action, until the combatant's next turn starts. */
  | {
      readonly type: "initiative.ready";
      readonly combatantId: string;
      readonly ready: boolean;
    }
  /**
   * Sets a combatant's initiative (T-111b: a player's roll told at the table); it is placed
   * anew by the ranking rule, the rest of the order stays.
   */
  | {
      readonly type: "initiative.setValue";
      readonly combatantId: string;
      readonly initiative: number;
    }
  /**
   * The players' rolls (T-111d), as one step: `add` join, `values` give combatants already in the
   * order their new initiative (and, with `playerId`, mark them as that player's).
   */
  | {
      readonly type: "initiative.enterRolls";
      readonly add: readonly Combatant[];
      readonly values: readonly {
        readonly combatantId: string;
        readonly initiative: number;
        readonly playerId?: string;
      }[];
    }
  /** Moves a combatant to `index` in turn order (reordering by hand). */
  | {
      readonly type: "initiative.move";
      readonly combatantId: string;
      readonly index: number;
    }
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
      readonly from: TokenPosition;
      readonly to: TokenPosition;
      readonly levelId: string;
    }
  | { readonly type: "combat.changed"; readonly combat: boolean }
  | { readonly type: "gridMode.changed"; readonly gridMode: GridMode | null }
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
  /** The order or a marker changed, or the initiative ended (T-111). */
  | { readonly type: "initiative.changed" }
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
  | "invalidCell"
  | "noFreeCell"
  | "notActive"
  | "notDelayed";
