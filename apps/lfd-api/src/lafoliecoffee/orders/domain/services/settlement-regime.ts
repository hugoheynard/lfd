import type { PaymentStatus, SettlementRegime } from "@lfd/contracts";

import type { SettlementVenue } from "../value-objects/settlement-venue.js";

const DUE: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>(["pending", "failed"]);

/**
 * **Le régime de règlement d'une commande**, nommé une fois.
 *
 * - `account` — passée **au compte** d'un pro : rien n'est encaissé à la
 *   passation, la commande est prélevée en fin de cycle ;
 * - `due` — un règlement par carte est attendu (`pending`) ou à reprendre
 *   (`failed`) ;
 * - `paid` — encaissé par carte (`refunded` en descend : il a été payé) ;
 * - `free` — total nul, rien à régler ;
 * - `offered` — offerte par l'équipe (`offer_nature` posée) : son total est nul
 *   comme `free`, mais c'est une décision tracée, pas un panier tombé à zéro ;
 * - `shop_till` — notée au comptoir pour un particulier, à régler à la caisse
 *   de la boutique. Son `paymentStatus` est `not_required`, comme une commande
 *   au compte : c'est le LIEU (`settlement_venue`, figé en base à la passation)
 *   qui la distingue, et il prime sur tout le reste.
 *
 * Pourquoi c'est une DÉDUCTION et pas une colonne : `not_required` n'est écrit
 * que par `Order.deferPayment()` à la passation, et aucune écriture postérieure
 * ne part de `not_required` (`PAID_FROM`, `FAILED_FROM`, `UNSETTLED` de
 * `PrismaOrderRepository` ne partent que de `pending`/`failed`). Le total, lui,
 * est réécrit par une modification depuis le 2026-10-23 (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») — mais la révision refuse de faire
 * passer une commande de `account` à `free` ou l'inverse (`revisionOf`,
 * vérifié le 2026-10-23). Le régime est donc figé dès la passation, et le
 * recalculer rend toujours la même valeur.
 *
 * Un particulier n'est jamais `account` : la boutique publique ne diffère le
 * règlement que sur un total nul (`PlaceShopOrderHandler.settle`, vérifié le
 * 2026-10-08).
 *
 * 🔴 Le critère SQL de l'assiette du prélèvement
 * (`accounting/infrastructure/billable-order-criterion.ts` :
 * `payment_status='not_required' ∧ total_cents > 0`) est la TRADUCTION de
 * `account` ici. Les deux changent ensemble.
 *
 * Le type vit dans le contrat (`settlementRegimeSchema`) : la fiche le porte.
 */
export function settlementRegimeOf(
  paymentStatus: PaymentStatus,
  totalCents: number,
  venue: SettlementVenue | null,
  offered: boolean,
): SettlementRegime {
  if (offered) {
    return "offered";
  }
  if (venue === "shop_till") {
    return "shop_till";
  }
  if (paymentStatus === "not_required") {
    return totalCents > 0 ? "account" : "free";
  }
  return DUE.has(paymentStatus) ? "due" : "paid";
}
