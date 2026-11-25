import type { AdminBackorderOriginView, AdminBackorderView } from "@lfd/contracts";

/** Ce que la fiche d'une commande montre de ses reliquats. */
export interface OrderBackorders {
  /** Le reliquat né de cette commande, si elle en est l'origine. */
  readonly backorder: AdminBackorderView | null;
  /** Le reliquat dont elle est issue, et son origine. */
  readonly origin: AdminBackorderOriginView | null;
}

/**
 * Port de **lecture** des reliquats d'une commande, pour sa fiche staff (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5) :
 * l'origine montre son reliquat et son état, la commande issue montre son
 * origine. Sans verrou : c'est un affichage.
 */
export abstract class OrderBackorderReader {
  abstract of(orderId: string): Promise<OrderBackorders>;
}
