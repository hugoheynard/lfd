import type { PaymentStatus, SettlementRegime } from "@lfd/contracts";

const DUE: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>(["pending", "failed"]);

/**
 * **Le régime de règlement d'une commande**, nommé une fois.
 *
 * - `account` — passée **au compte** d'un pro : rien n'est encaissé à la
 *   passation, la commande est prélevée en fin de cycle ;
 * - `due` — un règlement par carte est attendu (`pending`) ou à reprendre
 *   (`failed`) ;
 * - `paid` — encaissé par carte (`refunded` en descend : il a été payé) ;
 * - `free` — total nul, rien à régler.
 *
 * Pourquoi c'est une DÉDUCTION et pas une colonne : `not_required` n'est écrit
 * que par `Order.deferPayment()` à la passation, et aucune écriture postérieure
 * ne part de `not_required` (`PAID_FROM`, `FAILED_FROM`, `UNSETTLED` de
 * `PrismaOrderRepository` ne partent que de `pending`/`failed`) ; le total
 * n'est jamais réécrit après la passation (vérifié le 2026-10-08). Le régime
 * est donc figé dès la passation, et le recalculer rend toujours la même valeur.
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
): SettlementRegime {
  if (paymentStatus === "not_required") {
    return totalCents > 0 ? "account" : "free";
  }
  return DUE.has(paymentStatus) ? "due" : "paid";
}
