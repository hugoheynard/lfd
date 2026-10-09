import type { UnsettledSettlement } from "./unsettled-settlement.reader.js";

/**
 * Port de **lecture** de l'expiration des commandes boutique non réglées (plan
 * `documentation/order/commande-carte-reglee.md`, §4.1).
 *
 * Le périmètre est celui que l'adaptateur pose dans chaque `where`, et lui
 * seul : une commande `placed`, au règlement `pending` ou `failed`, que le
 * particulier a passée **lui-même** (`placedByStaffId` nul), sans société, de
 * clientèle `public`, et portant une intention Stripe directe. Une commande
 * passée par le staff (lien de règlement) ou pour une société n'y entre
 * jamais : elle garde le seul balayage de clôture.
 */
export abstract class UnsettledShopOrderReader {
  /** Les commandes du périmètre passées strictement avant `cutoff`. */
  abstract placedBefore(cutoff: Date): Promise<readonly UnsettledSettlement[]>;

  /**
   * Les commandes du périmètre que `newOrderId` remplace : celles du même
   * acheteur, autres qu'elle. Vide si `newOrderId` n'est pas elle-même dans le
   * périmètre — une commande passée par le staff ne remplace rien.
   */
  abstract replacedBy(newOrderId: string): Promise<readonly UnsettledSettlement[]>;
}
