import type { MonthlyClosureView } from "./monthly-invoices.js";
import type { UnconfirmedDeliveryView } from "./unconfirmed-deliveries.js";

/**
 * **L'onglet « Factures » de la procédure de prélèvement** (Hugo,
 * 2026-10-24 ; plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * § 12). Calculé par le serveur à chaque lecture, comme les autres onglets.
 * Types seulement. Montants en centimes.
 */

/**
 * Pourquoi l'onglet est dans son état. Une VALEUR : stable.
 *
 * - `not_yet_issuable` — la clôture est à venir (verrouillé) ;
 * - `before_service` — la clôture précède la mise en service de la facture du mois ;
 * - `unconfirmed_deliveries` — des bons de la période attendent qu'on constate leur remise ;
 * - `missing_invoices` — des bons de l'assiette n'ont pas leur facture ;
 * - `all_invoiced` — tout est facturé ;
 * - `no_closure` — aucune clôture à montrer, ou la clôture n'est pas une
 *   clôture de facturation du calendrier : rien ne s'y émet.
 */
export type CollectionProcedureInvoicesReasonView =
  | "not_yet_issuable"
  | "before_service"
  | "unconfirmed_deliveries"
  | "missing_invoices"
  | "all_invoiced"
  | "no_closure";

/** Onglet 3 — les factures de LA période de la procédure. */
export interface CollectionProcedureInvoicesView {
  readonly state: "locked" | "to_do" | "waiting" | "done";
  readonly reason: CollectionProcedureInvoicesReasonView;
  /**
   * Les bons passés au compte avant la clôture, sans facture, des payeurs qui
   * closent ici — ce que « Émettre » prendrait (bons non facturables compris).
   */
  readonly missingOrderCount: number;
  /**
   * Les bons à constater de la période : jour demandé dans la période et
   * passé, remise non constatée, payeur qui clôt ici — du plus ancien au
   * plus récent. Ils ne sont dans aucune facture tant qu'on ne les constate pas.
   */
  readonly unconfirmedDeliveries: readonly UnconfirmedDeliveryView[];
  /** La clôture, telle que la carte de ses factures la lit ; `null` sans clôture. */
  readonly closure: MonthlyClosureView | null;
}
