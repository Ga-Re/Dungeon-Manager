import type { Combatant } from "@dungeon-manager/schema";

// Initiative rules (T-111, DM decisions 2026-11-21). Pure; the random source is injected.

/** A d20 roll plus `bonus` (T-111: creatures roll their initiative). */
export function rollInitiative(bonus: number, random: () => number): number {
  const d20 = Math.min(20, Math.floor(random() * 20) + 1);
  return d20 + bonus;
}

/**
 * Whether `a` goes before `b` in turn order (T-111): the higher initiative; on a tie the higher
 * bonus; then a player's character before a creature. Otherwise neither does (entry order).
 */
export function goesBefore(a: Combatant, b: Combatant): boolean {
  if (a.initiative !== b.initiative) return a.initiative > b.initiative;
  const bonusA = a.initiativeBonus ?? 0;
  const bonusB = b.initiativeBonus ?? 0;
  if (bonusA !== bonusB) return bonusA > bonusB;
  return a.playerId !== undefined && b.playerId === undefined;
}
