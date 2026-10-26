import type { DeliveryNote } from "../../domain/entities/delivery-note.js";

/**
 * Le BL d'un rang parmi ceux d'une commande (plan E7 reliquat, L4a, L4b) :
 * le vivant d'abord ; à défaut un annulé, que la transition refusera ;
 * `undefined` si aucun BL n'a ce rang.
 */
export function remainderNoteOf(
  notes: readonly DeliveryNote[],
  rank: number,
): DeliveryNote | undefined {
  const ofRank = notes.filter((candidate) => candidate.rank === rank);
  return ofRank.find((candidate) => candidate.isLive) ?? ofRank[0];
}
