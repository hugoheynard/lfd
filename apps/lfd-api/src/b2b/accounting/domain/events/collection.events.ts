import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { CollectionBatch } from "../entities/collection-batch.js";
import { cycleTagOf } from "../services/pain008-document.js";
import { COLLECTION_FACT_TYPES } from "./accounting-facts.js";

const BATCH_SUBJECT = "collection_batch";

/** L'entité émettrice d'un lot, avec son nom du moment. */
export interface BatchEntity {
  readonly id: string;
  readonly name: string;
}

/** « Lot B2B 202609 » — le nom sous lequel le journal cite un lot. */
export function batchLabel(batch: CollectionBatch): string {
  const state = batch.toPersistence();
  return `Lot ${state.scheme} ${cycleTagOf(state.cycle.closesAt)}`;
}

function batchFact(
  type: JournalFact["type"],
  batch: CollectionBatch,
  entity: BatchEntity,
  at: Date,
  extra: Record<string, unknown>,
): JournalFact {
  const state = batch.toPersistence();
  return {
    type,
    subjectType: BATCH_SUBJECT,
    subjectId: batch.id,
    occurredAt: at,
    payload: {
      subjectLabel: batchLabel(batch),
      legalEntity: { id: entity.id, name: entity.name },
      scheme: state.scheme,
      cycleClosesAt: state.cycle.closesAt.toISOString(),
      lineCount: state.lines.length,
      totalCents: batch.totalCents,
      ...extra,
    },
  };
}

/** Un lot vient d'être constitué — son fichier est figé. */
export class CollectionBatchConstitutedEvent implements JournaledEvent {
  constructor(
    readonly batch: CollectionBatch,
    readonly entity: BatchEntity,
    readonly at: Date,
    readonly excludedCount: number,
  ) {}

  journalFact(): JournalFact {
    return batchFact(COLLECTION_FACT_TYPES.batchConstituted, this.batch, this.entity, this.at, {
      depositable: this.batch.depositable,
      unmandatedCompanies: [...this.batch.toPersistence().unmandatedCompanies],
      excludedCount: this.excludedCount,
    });
  }
}

/** Un lot a été annulé avant dépôt. */
export class CollectionBatchCancelledEvent implements JournaledEvent {
  constructor(
    readonly batch: CollectionBatch,
    readonly entity: BatchEntity,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return batchFact(COLLECTION_FACT_TYPES.batchCancelled, this.batch, this.entity, this.at, {});
  }
}

/** Un lot a été déposé à la banque. */
export class CollectionBatchDepositedEvent implements JournaledEvent {
  constructor(
    readonly batch: CollectionBatch,
    readonly entity: BatchEntity,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return batchFact(COLLECTION_FACT_TYPES.batchDeposited, this.batch, this.entity, this.at, {});
  }
}

/** Une commande est sortie du prélèvement : réglée autrement. */
export class OrderSettledOtherwiseEvent implements JournaledEvent {
  constructor(
    readonly order: { readonly id: string; readonly orderNumber: string },
    readonly at: Date,
    readonly amountCents: number,
    readonly previousState: "due" | "excluded",
    readonly note: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: COLLECTION_FACT_TYPES.orderSettledOtherwise,
      subjectType: "order",
      subjectId: this.order.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: this.order.orderNumber,
        amountCents: this.amountCents,
        previousState: this.previousState,
        note: this.note,
      },
    };
  }
}
