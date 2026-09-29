/** Une ligne d'une commande, telle que le colisage a besoin de la lire. */
export interface DeliveryOrderLine {
  /** Le SKU PRODUIT porté par la ligne — celui de la grille des contenances. */
  readonly sku: string;
  /** Le nom figé à la passation. */
  readonly name: string;
  readonly quantity: number;
}

/**
 * **Les lignes d'une commande, vues par le colisage** (lot 4 bis, L4b-C4) —
 * ce que la livraison DÉCLARE et que le commerce implémente
 * (`b2b/orders/infrastructure/`), relié dans `appBootstrap`.
 *
 * Un port à lui plutôt qu'une méthode de plus sur `DeliveryOrdersReader` : le
 * colisage est son seul lecteur, et la composition n'a que faire des lignes
 * (ISP). **Aucun montant** : ni prix, ni TVA — la livraison n'en a que faire.
 */
export abstract class DeliveryOrderLinesReader {
  /** Les lignes de cette commande, dans l'ordre de la commande ; vide si elle est inconnue. */
  abstract linesOf(orderId: string): Promise<readonly DeliveryOrderLine[]>;
}
