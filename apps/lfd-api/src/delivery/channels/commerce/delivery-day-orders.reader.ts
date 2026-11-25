import type { DeliveryDayAddressOrder } from "@lfd/contracts";

/**
 * **Les livraisons d'un jour, vues du carnet** — ce que la livraison DÉCLARE et
 * que le commerce implémente (`lafoliecoffee/orders/infrastructure/`), relié
 * dans `appBootstrap/delivery-feed.module.ts`.
 *
 * Une interface à part (ISP) : seule la vue « Aujourd'hui / Demain » de
 * l'onglet « Adresses » en dépend. « Attendue ce jour » est le filtre de la
 * file du comptoir et de la feuille de route, écrit côté commerce ; les
 * annulées sont absentes.
 */
export abstract class DeliveryDayOrdersReader {
  abstract deliveriesOn(day: string): Promise<readonly DeliveryDayAddressOrder[]>;
}
