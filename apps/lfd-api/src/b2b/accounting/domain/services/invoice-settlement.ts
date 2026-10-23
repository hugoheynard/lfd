import {
  isDeadBatchStatus,
  type CollectionBatchStatus,
} from "../entities/collection-batch-status.js";

/**
 * **Le statut de règlement d'une facture, vu par le client** (plan
 * `documentation/comptabilite/facturation/plan-page-mes-factures.md`, §7.1).
 *
 * DÉRIVÉ à la lecture : aucune colonne ne le range, rien ne l'écrit. La table
 * est TOTALE et ORDONNÉE — la première règle qui s'applique gagne :
 *
 * 1. un avoir n'a pas de statut ;
 * 2. payée par carte → acquittée ;
 * 3. sa DERNIÈRE ligne de prélèvement dans un lot non annulé (par instant de
 *    constitution — un lot annulé relâche ses factures) dit l'état : lot
 *    constitué, déposé, ou le retour de la banque et ce que l'équipe en a fait ;
 * 4. aucune ligne : prélèvement prévu à l'échéance — sauf facture BLOQUÉE,
 *    « en cours de traitement ».
 *
 * Pas de prélèvement partiel : une facture est encaissée entière ou pas, et
 * un rejet porte sur toute la ligne, donc sur toutes ses factures.
 */

export type InvoiceSettlementStatus =
  | "card_paid"
  | "collection_planned"
  | "collected"
  | "collection_rejected"
  | "recollection_planned"
  | "settled"
  | "closed"
  | "processing";

/** L'état d'un lot tel que la ligne le voit. */
export type DebitBatchStatus = CollectionBatchStatus;

/** Ce que l'équipe a décidé du retour de la banque. */
export type DebitReturnResolution = "pending" | "represented" | "settled_otherwise" | "written_off";

/** Une ligne de prélèvement qui porte la facture. Jours en `AAAA-MM-JJ`. */
export interface InvoiceDebitFact {
  readonly batchId: string;
  readonly batchStatus: DebitBatchStatus;
  readonly constitutedAt: Date;
  /** L'échéance figée du lot ; `null` pour un lot d'avant le 2026-10-08. */
  readonly requestedCollectionDay: string | null;
  /** Le jour annoncé par l'avis de la ligne — le repli des lots anciens. */
  readonly noticeCollectionDay: string | null;
  readonly returnResolution: DebitReturnResolution | null;
  readonly returnedOn: string | null;
  /** Les factures de la ligne, celle-ci comprise. */
  readonly invoiceCountOnDebit: number;
}

/** Tout ce qu'il faut pour dire le statut d'une pièce. */
export interface InvoiceSettlementFacts {
  readonly isCreditNote: boolean;
  readonly paidOn: string | null;
  readonly dueOn: string | null;
  readonly debits: readonly InvoiceDebitFact[];
  /**
   * Un de ses bons n'attend plus d'être prélevé normalement : écarté d'un
   * lot, réglé autrement, annulé… — l'équipe doit décider (Q-E).
   */
  readonly blocked: boolean;
}

export interface InvoiceSettlement {
  readonly status: InvoiceSettlementStatus;
  readonly date: string | null;
  readonly otherInvoicesOnDebit: number;
}

/** Le statut d'une pièce ; `null` pour un avoir. */
export function settlementOf(facts: InvoiceSettlementFacts): InvoiceSettlement | null {
  if (facts.isCreditNote) {
    return null;
  }
  if (facts.paidOn !== null) {
    return settlement("card_paid", facts.paidOn, 0);
  }
  const debit = latestLiveDebit(facts.debits);
  if (debit !== null) {
    return debitSettlement(debit);
  }
  return facts.blocked
    ? settlement("processing", null, 0)
    : settlement("collection_planned", facts.dueOn, 0);
}

/** La dernière ligne d'un lot vivant (ni annulé, ni rejeté par la banque) ; à instant égal, le plus grand id (ULID). */
function latestLiveDebit(debits: readonly InvoiceDebitFact[]): InvoiceDebitFact | null {
  let latest: InvoiceDebitFact | null = null;
  for (const debit of debits) {
    if (!isDeadBatchStatus(debit.batchStatus) && (latest === null || isLater(debit, latest))) {
      latest = debit;
    }
  }
  return latest;
}

function isLater(candidate: InvoiceDebitFact, current: InvoiceDebitFact): boolean {
  const delta = candidate.constitutedAt.getTime() - current.constitutedAt.getTime();
  return delta !== 0 ? delta > 0 : candidate.batchId > current.batchId;
}

function debitSettlement(debit: InvoiceDebitFact): InvoiceSettlement {
  const others = Math.max(debit.invoiceCountOnDebit - 1, 0);
  const day = debit.requestedCollectionDay ?? debit.noticeCollectionDay;
  switch (debit.returnResolution) {
    case "pending":
      return settlement("collection_rejected", debit.returnedOn, others);
    case "represented":
      return settlement("recollection_planned", null, others);
    case "settled_otherwise":
      return settlement("settled", null, others);
    case "written_off":
      return settlement("closed", null, others);
    case null:
      return debit.batchStatus === "deposited"
        ? settlement("collected", day, others)
        : settlement("collection_planned", day, others);
  }
}

function settlement(
  status: InvoiceSettlementStatus,
  date: string | null,
  otherInvoicesOnDebit: number,
): InvoiceSettlement {
  return { status, date, otherInvoicesOnDebit };
}
