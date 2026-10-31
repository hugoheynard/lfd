import type { DeliveryNoteDiscountPart } from "../services/delivery-note-discount-parts.js";

/**
 * **Les parts d'un bon par remise, figées au départ** (plan des promotions,
 * § 18.2, lot M4) — port d'écriture de `delivery_note_discounts`.
 *
 * Il n'y a pas d'invariant à garder ici : les parts sortent du domaine
 * (`deliveryNoteDiscountPartsOf`), déjà contrôlées contre l'en-tête du bon.
 * L'écriture est idempotente — l'unicité `(note_id, order_discount_id)` en
 * base rend un second départ du même bon sans effet — et rejoint l'unité de
 * travail de l'appelant : les parts partent avec le bon, ou pas du tout.
 */
export abstract class DeliveryNoteDiscountWriter {
  abstract record(noteId: string, parts: readonly DeliveryNoteDiscountPart[]): Promise<void>;
}
