import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { BankReturnCheckEntry } from "../entities/bank-return-check.js";
import { BANK_RETURN_CHECK_FACT_TYPES } from "./accounting-facts.js";
import type { ExportEntity } from "./mandate-bank-export.events.js";

/**
 * Une ligne du registre « Retours contrôlés » — attestation ou retrait. Le
 * sujet est l'ENTITÉ : un fichier d'impayés est quotidien et mêle ses lots.
 * L'auteur est celui de la ligne du journal (`publishTraced`).
 */
export class BankReturnCheckRecordedEvent implements JournaledEvent {
  constructor(
    readonly entry: BankReturnCheckEntry,
    readonly entity: ExportEntity,
  ) {}

  journalFact(): JournalFact {
    const { entry, entity } = this;
    return {
      type: entry.withdrawn
        ? BANK_RETURN_CHECK_FACT_TYPES.withdrawn
        : BANK_RETURN_CHECK_FACT_TYPES.attested,
      subjectType: "legal_entity",
      subjectId: entity.id,
      occurredAt: entry.at,
      payload: {
        subjectLabel: entity.name,
        day: entry.day,
        ...(entry.withdrawn && entry.note !== null ? { note: entry.note } : {}),
      },
    };
  }
}
