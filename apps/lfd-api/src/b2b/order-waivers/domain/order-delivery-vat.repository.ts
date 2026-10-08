import type { DeliveryVatMode } from "@lfd/contracts";

/**
 * Port d'**administration** de la TVA de la livraison (plan
 * `documentation/order/plan-tva-des-frais-de-port.md`, V2).
 *
 * Une seule valeur pour toute la maison (décision du 2026-10-08 : réglage
 * global, pas par zone). `read` rend `null` quand rien n'a été posé — c'est le
 * port de LECTURE de la passation (`OrderDeliveryVatReader`) qui fait le repli
 * sur `standard`, pour que l'écran distingue un choix d'un repli.
 */
export abstract class OrderDeliveryVatRepository {
  abstract read(): Promise<DeliveryVatMode | null>;

  /** Pose ou remplace le mode. */
  abstract save(mode: DeliveryVatMode, updatedBy: string): Promise<void>;
}
