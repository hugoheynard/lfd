import type { DeliverySlot, DeliverySpecs, Weekday } from "./address.js";

/**
 * Les **créneaux préférés d'un jour** — le seul point de lecture (plan
 * composition automatique §14.1). Ne lit que `slotList` : l'ancien `slots` est
 * retiré du code depuis le 2026-10-07 (`plan-retrait-slots.md`), chaque
 * adresse rangée ayant reçu sa liste par migration.
 *
 * `day` à `null` (jour pas encore choisi) : seuls les créneaux « tous les
 * jours » s'appliquent. Un jour `null` en `perDay` = aucun créneau.
 */
export function slotsFor(
  specs: Pick<DeliverySpecs, "slotList">,
  day: Weekday | null,
): readonly DeliverySlot[] {
  const list = specs.slotList;
  if (list.mode === "everyday") {
    return list.slots;
  }
  return day === null ? [] : (list.byDay[day] ?? []);
}
