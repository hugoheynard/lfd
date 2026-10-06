import type { BillingAddressPayload, GpsPoint } from "@lfd/contracts";

/**
 * **L'adresse du carnet d'une commande livrée**, telle que les suggestions de
 * correction la lisent (`gps-y-aller-et-position.md`, §6) : à quelle
 * adresse rattacher un geste, et ses deux points d'aujourd'hui.
 */
export interface DeliveryOrderAddress {
  readonly orderId: string;
  /** L'adresse du carnet — identifiant OPAQUE pour la livraison. */
  readonly addressId: string;
  /** Sa société — le mur que la correction présentera au commerce. */
  readonly companyId: string;
  /** La raison sociale du client. */
  readonly customerLabel: string;
  /** Le libellé de l'adresse au carnet. */
  readonly addressLabel: string;
  /** Les lignes postales du carnet AUJOURD'HUI — de quoi retrouver le géocodage. */
  readonly address: BillingAddressPayload;
  /** La porte : le point GPS des consignes, ou `null`. */
  readonly door: GpsPoint | null;
  /** Le stationnement, ou `null`. */
  readonly parking: GpsPoint | null;
}

/**
 * **Les adresses du carnet derrière des commandes** — ce que la livraison
 * DÉCLARE et que le commerce implémente (`b2b/orders/infrastructure/`),
 * relié dans `appBootstrap/delivery-feed.module.ts`.
 *
 * Une interface à part (ISP) : seules les suggestions de correction en
 * dépendent. Les commandes sans adresse reliée, ou reliée à une adresse
 * archivée ou d'une autre société (le mur), sont ABSENTES.
 */
export abstract class DeliveryAddressPointsReader {
  abstract addressesOfOrders(orderIds: readonly string[]): Promise<readonly DeliveryOrderAddress[]>;
}
