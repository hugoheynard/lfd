import type { DeliveryNoteState } from "../entities/delivery-note.js";

/**
 * Port de **lecture** des bons de livraison (plan E5a) — distinct du dépôt,
 * qui prend et rend l'agrégat : imprimer un BL ne le mute pas, et la fiche
 * commande n'a besoin que de cette méthode.
 *
 * Aucun mur ici : l'appelant lit d'abord la commande et applique le sien.
 */
export abstract class DeliveryNoteReader {
  /** Les BL d'une commande, par rang, tous statuts confondus ; vide si elle n'en a pas. */
  abstract listForOrder(orderId: string): Promise<readonly DeliveryNoteState[]>;
}
