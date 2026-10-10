/**
 * **« Cette commande est-elle gérée au colisage ? »** — port que le colisage
 * DÉCLARE et IMPLÉMENTE lui-même, et que la livraison lit (plan
 * `documentation/colisage/colisage.md`, K2b, §5.1, B1).
 *
 * Une commande dont les contenants se listent au colisage (`container_mode =
 * 'listed'`) n'a qu'une porte pour ses bacs : `BinDesk`. Les anciennes routes
 * de la livraison la lisaient et refusaient ; depuis le retrait de la
 * déclaration et du partage (2026-10-10, §9, voie (b)), il ne reste que
 * l'annulation (`VoidDeliveryBinHandler`, vérifié le 2026-10-10). Sans quoi un
 * contenant pointerait un bac annulé à son insu.
 */
export abstract class ContainerManagedOrders {
  /** `true` si au moins une journée colise cette commande en mode `listed`. */
  abstract isManaged(orderId: string): Promise<boolean>;
}
