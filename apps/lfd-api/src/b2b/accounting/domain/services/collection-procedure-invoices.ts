import type { ProcedureStepState } from "./collection-procedure.js";

/**
 * **L'onglet « Factures » de la procédure** (Hugo, 2026-10-24 ; plan
 * `plan-page-procedure-de-prelevement.md`, § 12). Pur : les nombres sont lus
 * ailleurs, par les mêmes lectures que l'émission (`uninvoicedOrders`,
 * fenêtre `[plancher, clôture[`, payeurs qui closent ici) — aucune règle
 * d'assiette n'est recopiée ici.
 *
 * L'onglet ne verrouille PAS le fichier : une ligne de lot encaisse les
 * factures émises qu'elle trouve (`le-prelevement-suit-la-facture.md` § 1),
 * et le domaine n'exige pas que toutes le soient (vérifié le 2026-10-24 dans
 * `constitute-collection-batches.handler.ts`).
 */

/**
 * - `not_yet_issuable` — la veille de la clôture à 23h55 n'est pas passée ;
 * - `before_service` — la clôture précède la mise en service de la facture
 *   du mois (ou le plancher a disparu) : rien ne s'y facture ;
 * - `unconfirmed_deliveries` — des bons de la période attendent qu'on
 *   constate leur remise : ils ne sont dans aucune facture ;
 * - `missing_invoices` — des bons de l'assiette n'ont pas leur facture ;
 * - `all_invoiced` — tout est facturé ;
 * - `no_closure` — la page n'a aucune clôture à montrer.
 */
export type InvoicesReason =
  | "not_yet_issuable"
  | "before_service"
  | "unconfirmed_deliveries"
  | "missing_invoices"
  | "all_invoiced"
  | "no_closure";

export interface InvoicesFacts {
  /** L'heure d'émission de la clôture est passée. */
  readonly reached: boolean;
  /** La clôture suit la mise en service : elle se facture. */
  readonly open: boolean;
  /** Bons de l'assiette sans facture, pour les payeurs qui closent ici. */
  readonly missingOrderCount: number;
  /** Bons de la période dont la remise n'est pas constatée, leur jour passé. */
  readonly unconfirmedCount: number;
}

/**
 * « Fait » quand tous les bons facturables de la période ont leur facture et
 * qu'aucun bon de la période n'attend d'être constaté ; « à faire » sinon ;
 * « verrouillé » tant que la clôture est à venir. Les bons à constater
 * passent en premier : c'est le premier geste — constater fait entrer un bon
 * dans l'assiette, puis l'émission le facture.
 */
export function invoicesStatus(facts: InvoicesFacts): {
  readonly state: ProcedureStepState;
  readonly reason: InvoicesReason;
} {
  if (!facts.reached) {
    return { state: "locked", reason: "not_yet_issuable" };
  }
  if (!facts.open) {
    return { state: "done", reason: "before_service" };
  }
  if (facts.unconfirmedCount > 0) {
    return { state: "to_do", reason: "unconfirmed_deliveries" };
  }
  if (facts.missingOrderCount > 0) {
    return { state: "to_do", reason: "missing_invoices" };
  }
  return { state: "done", reason: "all_invoiced" };
}
