import type { DeliverySlot } from '@lfd/contracts';

import { isDeadlineTime } from './deadline-list.model';

/**
 * **Une liste de créneaux préférés**, telle que le carnet la tient : du plus
 * tôt au plus tard, sans chevauchement (plan composition automatique §14.1,
 * CA3b — « plusieurs créneaux par adresse »).
 *
 * Comme les échéances (`deadline-list.model.ts`), l'ordre est tenu PAR
 * CONSTRUCTION à chaque geste : le contrat refuse une liste désordonnée ou
 * chevauchante, et un formulaire qui la laisserait se former ferait lire un
 * refus pour une faute que personne n'a commise.
 *
 * Pur, sans Angular : le runner du paquet (Node) l'éprouve.
 */

/** Un créneau que le contrat accepte : deux heures `HH:mm`, la fin après le début. */
export function isSlot(start: string, end: string): boolean {
  return isDeadlineTime(start) && isDeadlineTime(end) && start < end;
}

/** Deux créneaux se chevauchent-ils ? Bord à bord (`08:00` / `08:00`) n'est pas un chevauchement. */
export function slotsOverlap(a: DeliverySlot, b: DeliverySlot): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Ce créneau peut-il entrer dans la liste ? Lisible, et ne chevauchant aucun autre. */
export function canAddSlot(slots: readonly DeliverySlot[], slot: DeliverySlot): boolean {
  return isSlot(slot.start, slot.end) && !slots.some((other) => slotsOverlap(other, slot));
}

/**
 * Ajoute un créneau à sa place. Un créneau illisible ou qui en chevauche un
 * autre laisse la liste telle quelle.
 */
export function withSlot(
  slots: readonly DeliverySlot[],
  slot: DeliverySlot,
): readonly DeliverySlot[] {
  if (!canAddSlot(slots, slot)) {
    return slots;
  }
  return [...slots, { start: slot.start, end: slot.end }].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
}

/** Retire un créneau ; un créneau absent laisse la liste telle quelle. */
export function withoutSlot(
  slots: readonly DeliverySlot[],
  slot: DeliverySlot,
): readonly DeliverySlot[] {
  return slots.filter((other) => other.start !== slot.start || other.end !== slot.end);
}
