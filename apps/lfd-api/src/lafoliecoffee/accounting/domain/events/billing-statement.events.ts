import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { BillingStatement } from "../entities/billing-statement.js";
import type { CollectionBatch } from "../entities/collection-batch.js";
import { BILLING_STATEMENT_FACT_TYPES } from "./accounting-facts.js";
import { batchLabel, type BatchEntity } from "./collection.events.js";

const STATEMENT_SUBJECT = "billing_statement";

/** Le payeur d'une ligne, avec son nom du moment. */
export interface StatementPayer {
  readonly id: string;
  readonly name: string;
}

/** « Arrêté Lot B2B 202609 · ligne 1 » — le nom sous lequel le journal cite un arrêté. */
function statementLabel(batch: CollectionBatch, lineRank: number): string {
  return `Arrêté ${batchLabel(batch)} · ligne ${String(lineRank)}`;
}

/** Un arrêté vient d'être figé, avec la constitution de son lot. */
export class BillingStatementIssuedEvent implements JournaledEvent {
  constructor(
    readonly statement: BillingStatement,
    readonly batch: CollectionBatch,
    readonly entity: BatchEntity,
    readonly payer: StatementPayer,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    const state = this.statement.toPersistence();
    return {
      type: BILLING_STATEMENT_FACT_TYPES.issued,
      subjectType: STATEMENT_SUBJECT,
      subjectId: state.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: statementLabel(this.batch, state.lineRank),
        legalEntity: { id: this.entity.id, name: this.entity.name },
        payer: { id: this.payer.id, name: this.payer.name },
        batch: { id: this.batch.id, name: batchLabel(this.batch) },
        lineRank: state.lineRank,
        orderCount: state.orderIds.length,
        totalCents: state.totalTtcCents,
        ordersTotalCents: state.ordersTotalCents,
      },
    };
  }
}

/** Un arrêté a été annulé avec son lot, avant dépôt. */
export class BillingStatementCancelledEvent implements JournaledEvent {
  constructor(
    readonly statementId: string,
    readonly lineRank: number,
    readonly batch: CollectionBatch,
    readonly entity: BatchEntity,
    readonly payer: StatementPayer,
    readonly totalCents: number,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: BILLING_STATEMENT_FACT_TYPES.cancelled,
      subjectType: STATEMENT_SUBJECT,
      subjectId: this.statementId,
      occurredAt: this.at,
      payload: {
        subjectLabel: statementLabel(this.batch, this.lineRank),
        legalEntity: { id: this.entity.id, name: this.entity.name },
        payer: { id: this.payer.id, name: this.payer.name },
        batch: { id: this.batch.id, name: batchLabel(this.batch) },
        lineRank: this.lineRank,
        totalCents: this.totalCents,
      },
    };
  }
}
