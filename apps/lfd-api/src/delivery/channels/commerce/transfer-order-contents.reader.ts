import type { DeliveryOrderLine } from "./delivery-order-lines.reader.js";

/**
 * **Ce que contiennent les commandes d'un transfert interne** — décision de
 * Hugo du 2026-10-13 : « on doit savoir ce qu'on transporte ». Ce que la
 * livraison DÉCLARE et que le commerce implémente
 * (`b2b/orders/infrastructure/`), relié dans `appBootstrap`.
 *
 * Lecteur PAR LOT, à lui (ISP) : `DeliveryOrderLinesReader` lit une commande à
 * la fois pour le colisage, et le manifeste en lit des dizaines. **Aucun
 * montant.** `delivery → b2b` reste interdit : la livraison ne lit jamais
 * `public.order_lines`.
 */
export abstract class TransferOrderContentsReader {
  /**
   * Les lignes de ces commandes (SKU, nom figé à la passation, quantité), par
   * commande, dans l'ordre de la commande. Une commande inconnue est ABSENTE :
   * le manifeste ne lui invente pas de contenu.
   */
  abstract contentsOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly DeliveryOrderLine[]>>;
}
