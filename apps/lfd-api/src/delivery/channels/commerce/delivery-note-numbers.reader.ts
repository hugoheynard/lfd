/** Un envoi demandé : la commande, et son rang (1 : la commande elle-même ; au-delà, un reliquat). */
export interface DeliveryShipmentKey {
  readonly orderId: string;
  readonly rank: number;
}

/** Le numéro du bon de livraison vivant d'un envoi (« BL-1042-1 »). */
export interface DeliveryShipmentNoteNumber extends DeliveryShipmentKey {
  readonly number: string;
}

/**
 * **Le numéro du bon de livraison de chaque envoi** (Hugo, 2026-10-26) — ce
 * que la livraison DÉCLARE et que le commerce implémente, relié dans
 * `appBootstrap`. La feuille de tournée et le dossier des tournées
 * l'impriment à côté de la référence de la commande.
 *
 * Un port à lui (ISP) : aucun autre lecteur du canal ne sait qu'un BL existe.
 * Le rang de l'arrêt est celui du BL (`ShipmentRef`, plan E7) : un reliquat
 * imprime SON bon, pas celui de la commande.
 */
export abstract class DeliveryNoteNumbersReader {
  /**
   * Le BL non annulé de chacun de ces envois. Un envoi sans BL (commande hors
   * plan, BL annulé) est ABSENT : on n'imprime rien plutôt qu'un numéro deviné.
   */
  abstract numbersOf(
    shipments: readonly DeliveryShipmentKey[],
  ): Promise<readonly DeliveryShipmentNoteNumber[]>;
}
