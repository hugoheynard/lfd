/** Ce que la livraison dit au commerce quand une tournée part. */
export interface DeliveryDeparture {
  readonly roundId: string;
  readonly departedAt: Date;
  /** Les commandes des arrêts vivants au départ — une commande = un arrêt. */
  readonly orderIds: readonly string[];
}

/**
 * **« La tournée est partie »** (`documentation/livraisons/plan-en-route.md`,
 * PL3-D1) — ce que la livraison DÉCLARE et que le commerce implémente
 * (`b2b/orders/application/services/`), relié dans
 * `appBootstrap/delivery-feed.module.ts`.
 *
 * Le seul port du canal qui ne soit pas une lecture : une **annonce**. La
 * livraison ne sait ni qu'un courriel en sortira, ni à qui ; écrire au client
 * est un geste du commerce (L6-C12), qui décide seul de ce qu'il en fait.
 *
 * Appelé hors de la transaction du départ, par un abonné suivi : l'échec d'une
 * annonce ne défait pas un départ.
 */
export abstract class DeliveryDepartureAnnouncer {
  abstract announceDeparture(departure: DeliveryDeparture): Promise<void>;
}
