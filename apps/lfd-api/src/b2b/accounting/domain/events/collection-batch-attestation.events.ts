import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type {
  AttestedBatch,
  BatchAttestationEntry,
} from "../entities/collection-batch-attestation.js";
import { cycleTagOf } from "../services/pain008-document.js";
import { BATCH_ATTESTATION_FACT_TYPES } from "./accounting-facts.js";
import type { ExportEntity } from "./mandate-bank-export.events.js";

/**
 * Une ligne du registre des attestations d'un lot — attestation ou retrait.
 * Le sujet est l'ENTITÉ (plan § 1.2) ; le lot est cité « Lot <schéma>
 * <cycle> », comme ailleurs au journal. L'auteur est celui de la ligne du
 * journal (`publishTraced`).
 */
export class BatchAttestationRecordedEvent implements JournaledEvent {
  constructor(
    readonly entry: BatchAttestationEntry,
    readonly batch: AttestedBatch,
    readonly entity: ExportEntity,
  ) {}

  journalFact(): JournalFact {
    const { entry, batch, entity } = this;
    return {
      type: entry.withdrawn
        ? BATCH_ATTESTATION_FACT_TYPES.withdrawn
        : BATCH_ATTESTATION_FACT_TYPES.attested,
      subjectType: "legal_entity",
      subjectId: entity.id,
      occurredAt: entry.at,
      payload: {
        subjectLabel: entity.name,
        batch: { id: batch.id, name: `Lot ${batch.scheme} ${cycleTagOf(batch.cycleClosesAt)}` },
        kind: entry.kind,
        ...(entry.withdrawn && entry.note !== null ? { note: entry.note } : {}),
      },
    };
  }
}
