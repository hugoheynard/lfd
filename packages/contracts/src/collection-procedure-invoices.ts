import type { MonthlyClosureView } from "./monthly-invoices.js";

/**
 * **L'onglet « Factures » de la procédure de prélèvement** (Hugo,
 * 2026-10-24 ; plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * § 12). Calculé par le serveur à chaque lecture, comme les autres onglets.
 * Types seulement. Montants en centimes.
 *
 * Refondu le même jour (§ 12.4) : UNE liste des commandes de la période, UN
 * statut par commande, décidé au serveur — là où l'onglet montrait des bons
 * « à constater » et des factures sans lien entre eux.
 */

/**
 * Pourquoi l'onglet est dans son état. Une VALEUR : stable.
 *
 * - `not_yet_issuable` — la clôture est à venir (verrouillé) ;
 * - `before_service` — la clôture précède la mise en service de la facture du mois ;
 * - `receipts_to_confirm` — des commandes de la période attendent qu'on confirme leur réception ;
 * - `receipts_to_invoice` — des réceptions confirmées n'ont pas encore leur facture ;
 * - `all_invoiced` — toutes les commandes de la période sont facturées ;
 * - `no_closure` — aucune clôture à montrer, ou la clôture n'est pas une
 *   clôture de facturation du calendrier : rien ne s'y émet.
 */
export type CollectionProcedureInvoicesReasonView =
  | "not_yet_issuable"
  | "before_service"
  | "receipts_to_confirm"
  | "receipts_to_invoice"
  | "all_invoiced"
  | "no_closure";

/**
 * Le statut d'une commande de la période — un seul, décidé au serveur.
 *
 * - `receipt_to_confirm` — aucune remise enregistrée, son jour est passé ;
 * - `receipt_confirmed` — remise enregistrée, pas encore facturée ;
 * - `invoiced` — une facture (380) la porte. L'emporte TOUJOURS, quel que
 *   soit son jour de réception.
 */
export type ProcedureOrderStatusView = "receipt_to_confirm" | "receipt_confirmed" | "invoiced";

/** Une commande de la période, telle que l'onglet la liste. */
export interface ProcedureOrderView {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly companyName: string;
  /**
   * `AAAA-MM-JJ` — le jour de retrait ou de livraison demandé, à défaut le
   * jour de réception ; `null` sans l'un ni l'autre.
   */
  readonly serviceDay: string | null;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly totalCents: number;
  readonly status: ProcedureOrderStatusView;
  /** Le numéro de la facture qui la porte ; `null` tant qu'elle n'est pas facturée. */
  readonly invoiceNumber: string | null;
}

/** Les trois chiffres clés de l'onglet, au vocabulaire des statuts. */
export interface ProcedureOrderFiguresView {
  readonly invoiced: number;
  /** Réceptions confirmées, pas encore facturées. */
  readonly receiptConfirmed: number;
  readonly receiptToConfirm: number;
}

/** Onglet 3 — les factures de LA période de la procédure. */
export interface CollectionProcedureInvoicesView {
  readonly state: "locked" | "to_do" | "waiting" | "done";
  readonly reason: CollectionProcedureInvoicesReasonView;
  /** Les commandes de la période, par jour demandé puis par numéro. */
  readonly orders: readonly ProcedureOrderView[];
  readonly figures: ProcedureOrderFiguresView;
  /**
   * Ce que « Émettre les factures des réceptions confirmées » prendrait : les
   * réceptions confirmées qui ont leur jour de réception.
   */
  readonly issuableCount: number;
  /** La clôture, telle que la carte de ses factures la lit ; `null` sans clôture. */
  readonly closure: MonthlyClosureView | null;
}
