import type { OrderPrincipal } from "../entities/order-shapes.js";
import type { OrderPayerStanding } from "../ports/order-payer.reader.js";

/**
 * **Le principal à copier sur une commande, à sa passation**
 * (`plan-notifications-sous-comptes.md`, §2, Q1).
 *
 * Lu sur la MÊME lecture que le payeur (`orderPayerOf`) : une seule photo de
 * la société à l'instant de la passation. Le principal voit le montant si le
 * site suit `billing` ou `pricing` à cet instant ; un suivi ouvert ou fermé
 * ensuite ne change pas ce qu'on dira d'une commande passée.
 *
 * `null` sans société ou sans principal.
 */
export function orderPrincipalOf(standing: OrderPayerStanding | null): OrderPrincipal | null {
  if (standing === null || standing.principalId === null) {
    return null;
  }
  return {
    companyId: standing.principalId,
    seesAmount: standing.billingFollow !== null || standing.followsPricing,
  };
}
