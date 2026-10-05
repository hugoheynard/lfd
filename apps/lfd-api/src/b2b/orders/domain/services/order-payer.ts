import {
  GroupAccountOrderRefusedError,
  OrderPayerNotActiveError,
} from "../errors/order-payer-errors.js";
import type { OrderPayerStanding } from "../ports/order-payer.reader.js";

/**
 * **Le payeur d'une commande, décidé à sa passation** (`plan-sous-comptes.md`
 * §2.3, §2.4) — puis copié sur la commande (`billed_company_id`).
 *
 * - une commande sans société n'a pas de payeur ;
 * - un compte de groupe sans livraison ne commande pas en son nom ;
 * - un site qui suit `billing` est réglé par son principal, qui doit être
 *   ACTIF (Q4 : un principal suspendu bloque les sites qui le suivent en
 *   `billing`, et eux seuls) ;
 * - sinon, la société paie elle-même — et c'est elle qu'on copie : une facture
 *   relue après un rattachement garde l'acheteur d'alors.
 *
 * @throws {GroupAccountOrderRefusedError} la société est un compte de groupe.
 * @throws {OrderPayerNotActiveError} le principal suivi n'est pas actif.
 */
export function orderPayerOf(standing: OrderPayerStanding | null): string | null {
  if (standing === null) {
    return null;
  }
  if (standing.groupWithoutDelivery) {
    throw new GroupAccountOrderRefusedError(standing.companyId, standing.companyName);
  }
  const follow = standing.billingFollow;
  if (follow === null) {
    return standing.companyId;
  }
  if (follow.payerStatus !== "active") {
    throw new OrderPayerNotActiveError(standing.companyId, follow.payerName);
  }
  return follow.payerId;
}
