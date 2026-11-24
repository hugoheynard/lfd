import type { DeliveryAddressBookRow } from "@lfd/contracts";

/**
 * **Le carnet des adresses de livraison, entier** — ce que la livraison
 * DÉCLARE et que le commerce implémente (`lafoliecoffee/account/infrastructure/`),
 * relié dans `appBootstrap/delivery-feed.module.ts`.
 *
 * Une interface à part (ISP) : seul l'onglet « Adresses » de Tour manager en
 * dépend. Les adresses archivées, celles d'une société supprimée et les
 * adresses de facturation sont ABSENTES ; l'ordre est celui du client, puis
 * du libellé.
 */
export abstract class DeliveryAddressBookReader {
  abstract deliveryAddresses(): Promise<readonly DeliveryAddressBookRow[]>;
}
