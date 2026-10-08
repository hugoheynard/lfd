import type { DeliveryVatMode } from "@lfd/contracts";

/**
 * Port de **lecture** du mode de TVA de la livraison, vu depuis la passation et
 * le devis de la boutique (plan `documentation/order/plan-tva-des-frais-de-port.md`).
 *
 * Rend **toujours** un mode : sans réglage posé, `standard` — ce que toute
 * commande a fait avant le réglage. Le repli est ici, et pas dans un DEFAULT
 * de colonne, parce qu'un DEFAULT ne joue pas sur une ligne absente.
 *
 * Distinct du port d'administration (ISP) : composer une commande n'autorise
 * pas à changer la règle fiscale.
 */
export abstract class OrderDeliveryVatReader {
  abstract current(): Promise<DeliveryVatMode>;
}
