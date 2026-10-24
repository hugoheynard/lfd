import type { DeliveryNote } from "../entities/delivery-note.js";

/**
 * Port d'**écriture** des bons de livraison : il prend et rend l'agrégat.
 *
 * Aucun port de lecture en E1 : personne ne lit un BL (plan E1, § 1).
 */
export abstract class DeliveryNoteRepository {
  /** Les BL de ces commandes, tous statuts confondus ; vide si aucune n'en a. */
  abstract loadForOrders(orderIds: readonly string[]): Promise<readonly DeliveryNote[]>;

  /**
   * Écrit le BL — neuf ou existant — et remplace ses lignes. L'unicité
   * `(order_id, rank)` en base refuse un second BL-1 : une prévision
   * concurrente échoue au lieu de dupliquer.
   */
  abstract save(note: DeliveryNote): Promise<void>;
}
