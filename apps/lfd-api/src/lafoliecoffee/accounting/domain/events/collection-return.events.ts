import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { CollectionReturn, ReturnableLine } from "../entities/collection-return.js";
import { cycleTagOf } from "../services/pain008-document.js";
import { COLLECTION_FACT_TYPES } from "./accounting-facts.js";

/** « Lot CORE 202609 » — comme `batchLabel`, depuis la ligne. */
export function returnedBatchLabel(line: ReturnableLine): string {
  return `Lot ${line.scheme} ${cycleTagOf(line.cycleClosesAt)}`;
}

/** Ce que les deux faits du retour disent en commun. Jamais d'IBAN. */
function returnFact(
  type: JournalFact["type"],
  bankReturn: CollectionReturn,
  line: ReturnableLine,
  at: Date,
  extra: Record<string, unknown>,
): JournalFact {
  const state = bankReturn.toPersistence();
  return {
    type,
    subjectType: "company",
    subjectId: line.debtorCompanyId,
    occurredAt: at,
    payload: {
      subjectLabel: line.debtorName,
      batch: { id: line.batchId, name: returnedBatchLabel(line) },
      endToEndId: state.endToEndId,
      kind: state.kind,
      reasonCode: state.reasonCode,
      reason: bankReturn.reason.description,
      returnedOn: state.returnedOn,
      amountCents: state.amountCents,
      ...extra,
    },
  };
}

/**
 * **La banque a rejeté ou retourné une ligne** (R5a). Sujet : le payeur — le
 * retour se lit sur sa fiche. La cloche du back-office l'écoute.
 */
export class CollectionReturnedEvent implements JournaledEvent {
  constructor(
    readonly bankReturn: CollectionReturn,
    readonly line: ReturnableLine,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    const state = this.bankReturn.toPersistence();
    return returnFact(COLLECTION_FACT_TYPES.returned, this.bankReturn, this.line, this.at, {
      feeCents: state.feeCents,
      source: state.source,
      proposesRevocation: this.bankReturn.reason.proposesRevocation,
    });
  }
}

/** Le staff a traité un retour : re-présenté, réglé autrement, ou perdu. */
export class CollectionReturnResolvedEvent implements JournaledEvent {
  constructor(
    readonly bankReturn: CollectionReturn,
    readonly line: ReturnableLine,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    const state = this.bankReturn.toPersistence();
    return returnFact(COLLECTION_FACT_TYPES.returnResolved, this.bankReturn, this.line, this.at, {
      resolution: state.resolution,
      note: state.resolutionNote,
    });
  }
}
