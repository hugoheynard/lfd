import type { NoteDiscountPartView } from "../services/delivery-note-sheet.js";

/**
 * **Les parts par remise des bons, pour leur papier** (plan des promotions,
 * § 18.6, lot M4) — port de lecture, séparé de `DeliveryNoteReader` (ISP) :
 * seuls les rendus chiffrés en ont l'usage.
 *
 * Aucun mur ici : l'appelant lit d'abord la commande et applique le sien,
 * puis ne demande que les bons de cette commande.
 */
export abstract class DeliveryNoteDiscountPartsReader {
  /** Les parts de chaque bon, dans l'ordre des rangs de remise ; un bon sans part n'y est pas. */
  abstract partsOf(
    noteIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly NoteDiscountPartView[]>>;
}
