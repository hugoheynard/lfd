import type { ProcedureStepState } from "./collection-procedure.js";

/**
 * **L'onglet « Factures » de la procédure** (Hugo, 2026-10-24 ; plan
 * `plan-page-procedure-de-prelevement.md`, § 12). Pur : les commandes sont
 * lues ailleurs, par les critères partagés de l'assiette
 * (`billable-order-criterion.ts`) — aucune règle d'assiette n'est recopiée ici.
 *
 * L'onglet ne verrouille PAS le fichier : une ligne de lot encaisse les
 * factures émises qu'elle trouve (`le-prelevement-suit-la-facture.md` § 1),
 * et le domaine n'exige pas que toutes le soient (vérifié le 2026-10-24 dans
 * `constitute-collection-batches.handler.ts`).
 */

/**
 * Le statut d'une commande de la période — un seul (Hugo, 2026-10-24, § 12.4).
 *
 * - `receipt_to_confirm` — aucune remise enregistrée, son jour passé ;
 * - `receipt_confirmed` — remise enregistrée, pas encore facturée ;
 * - `invoiced` — une facture 380 la porte ;
 * - `awaiting_remainder` — en partie retirée, un reste à relivrer (décision
 *   de Hugo du 2026-10-26) : on facture sur le livré une fois le sort du
 *   reste décidé, pas avant. Ni « à confirmer », ni « à facturer ».
 */
export type ProcedureOrderStatus =
  "receipt_to_confirm" | "receipt_confirmed" | "invoiced" | "awaiting_remainder";

export interface ProcedureOrderFacts {
  /** Une facture 380 porte la commande. */
  readonly invoiced: boolean;
  /** Le snapshot du retrait (`orders.handed_over_at`) est posé. */
  readonly handedOver: boolean;
  /** `AAAA-MM-JJ` — le jour de réception ; `null` s'il n'est pas posé. */
  readonly receivedOn: string | null;
  /** La commande est en partie retirée : un reste suit (plan E7 reliquat). */
  readonly awaitingRemainder: boolean;
}

/**
 * La facture l'emporte TOUJOURS : une commande facturée n'est jamais « à
 * confirmer », quel que soit son `received_on` — les factures émises avant
 * la règle du 2026-10-22 portent des bons sans jour de réception, et l'onglet
 * les disait « à constater » (constaté en dev le 2026-10-24).
 *
 * Un jour de réception posé vaut remise enregistrée : il n'est écrit qu'à la
 * remise (`MarkOrderFulfilledHandler`), et le retrait attesté
 * sans snapshot sur la commande existe (les fixtures e2e le sèment ainsi).
 */
export function procedureOrderStatus(facts: ProcedureOrderFacts): ProcedureOrderStatus {
  if (facts.invoiced) {
    return "invoiced";
  }
  if (facts.awaitingRemainder) {
    return "awaiting_remainder";
  }
  return facts.handedOver || facts.receivedOn !== null ? "receipt_confirmed" : "receipt_to_confirm";
}

/**
 * - `not_yet_issuable` — la veille de la clôture à 23h55 n'est pas passée ;
 * - `before_service` — la clôture précède la mise en service de la facture
 *   du mois (ou le plancher a disparu) : rien ne s'y facture ;
 * - `receipts_to_confirm` — des commandes attendent qu'on confirme leur réception ;
 * - `receipts_to_invoice` — des réceptions confirmées n'ont pas leur facture ;
 * - `awaiting_remainders` — rien n'est à confirmer ni à facturer, mais des
 *   commandes attendent leur reste : l'onglet est « partiel », pas « fait »
 *   (décision de Hugo du 2026-10-26) ;
 * - `all_invoiced` — tout est facturé ;
 * - `no_closure` — la page n'a aucune clôture à montrer.
 */
export type InvoicesReason =
  | "not_yet_issuable"
  | "before_service"
  | "receipts_to_confirm"
  | "receipts_to_invoice"
  | "awaiting_remainders"
  | "all_invoiced"
  | "no_closure";

export interface InvoicesFacts {
  /** L'heure d'émission de la clôture est passée. */
  readonly reached: boolean;
  /** La clôture suit la mise en service : elle se facture. */
  readonly open: boolean;
  readonly statuses: readonly ProcedureOrderStatus[];
}

/**
 * L'état de l'onglet : ceux de tous les onglets, plus « partiel », que seul
 * celui-ci connaît — une période dont des commandes attendent leur reste.
 */
export type InvoicesStepState = ProcedureStepState | "partial";

/**
 * Une commande `awaiting_remainder` n'appelle aucun geste de l'onglet : son
 * reste se livre ailleurs. Mais elle n'est pas facturée, et l'onglet ne dit
 * donc pas « fait » : il dit « partiel » (décisions de Hugo du 2026-10-26).
 *
 * « Fait » quand plus aucune commande n'est « à confirmer », « confirmée non
 * facturée » ni en attente de son reste ; « à faire » tant qu'un geste
 * attend ; « partiel » quand seul le reste attend ; « verrouillé » tant que
 * la clôture est à venir. Confirmer passe en premier : c'est le premier geste — la réception
 * confirmée fait entrer la commande dans l'assiette, puis l'émission la facture.
 */
export function invoicesStatus(facts: InvoicesFacts): {
  readonly state: InvoicesStepState;
  readonly reason: InvoicesReason;
} {
  if (!facts.reached) {
    return { state: "locked", reason: "not_yet_issuable" };
  }
  if (!facts.open) {
    return { state: "done", reason: "before_service" };
  }
  if (facts.statuses.includes("receipt_to_confirm")) {
    return { state: "to_do", reason: "receipts_to_confirm" };
  }
  if (facts.statuses.includes("receipt_confirmed")) {
    return { state: "to_do", reason: "receipts_to_invoice" };
  }
  if (facts.statuses.includes("awaiting_remainder")) {
    return { state: "partial", reason: "awaiting_remainders" };
  }
  return { state: "done", reason: "all_invoiced" };
}
