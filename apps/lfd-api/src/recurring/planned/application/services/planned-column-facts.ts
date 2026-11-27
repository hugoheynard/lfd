import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Noms stables des faits d'une colonne non commandée, clés de routage vers `@DurableHandler`. */
export const PLANNED_COLUMN_REFUSED = "recurring.planned_column_refused";
export const PLANNED_COLUMN_MISSED = "recurring.planned_column_missed";

export type PlannedColumnIssueType = typeof PLANNED_COLUMN_REFUSED | typeof PLANNED_COLUMN_MISSED;

/** L'issue : refusée par la passation (sa cause et sa phrase), ou manquée. */
export type PlannedColumnIssue =
  | { readonly kind: "refused"; readonly cause: string; readonly reason: string }
  | { readonly kind: "missed" };

/**
 * **Une colonne planifiée qui ne devient pas une commande** — écrite par le
 * balayage dans la transaction qui inscrit l'issue sur la colonne (plan du
 * planificateur, § 5). Une issue est définitive : une seule par colonne, la
 * clé `<type>:<columnId>` fait l'anti-doublon.
 *
 * Seule la cloche du staff l'écoute, dans le bloc : le fait ne quitte pas
 * le planificateur, d'où sa place hors du canal.
 */
export class PlannedColumnIssueFact implements DurableEvent {
  constructor(
    readonly columnId: string,
    readonly companyId: string,
    readonly buyerUserId: string,
    /** Le jour servi, `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly issue: PlannedColumnIssue,
  ) {}

  get type(): PlannedColumnIssueType {
    return this.issue.kind === "refused" ? PLANNED_COLUMN_REFUSED : PLANNED_COLUMN_MISSED;
  }

  durableFact(): DurableFact {
    const base = {
      columnId: this.columnId,
      companyId: this.companyId,
      buyerUserId: this.buyerUserId,
      serviceDay: this.serviceDay,
    };
    return {
      type: this.type,
      key: `${this.type}:${this.columnId}`,
      payload:
        this.issue.kind === "refused"
          ? { ...base, cause: this.issue.cause, reason: this.issue.reason }
          : base,
    };
  }

  /** @throws {PlannedColumnIssuePayloadError} une charge hors forme. */
  static fromDelivery(delivery: {
    readonly type: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }): PlannedColumnIssueFact {
    const { columnId, companyId, buyerUserId, serviceDay } = delivery.payload;
    const issue = issueOf(delivery.type, delivery.payload);
    if (
      issue === null ||
      !isText(columnId) ||
      !isText(companyId) ||
      !isText(buyerUserId) ||
      !isText(serviceDay)
    ) {
      throw new PlannedColumnIssuePayloadError(delivery.type);
    }
    return new PlannedColumnIssueFact(columnId, companyId, buyerUserId, serviceDay, issue);
  }
}

function issueOf(
  type: string,
  payload: Readonly<Record<string, unknown>>,
): PlannedColumnIssue | null {
  if (type === PLANNED_COLUMN_MISSED) {
    return { kind: "missed" };
  }
  const { cause, reason } = payload;
  if (type !== PLANNED_COLUMN_REFUSED || !isText(cause) || !isText(reason)) {
    return null;
  }
  return { kind: "refused", cause, reason };
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Un fait de colonne illisible : la cloche n'a pas sonné, le message reste visible. */
export class PlannedColumnIssuePayloadError extends TechnicalError {
  constructor(type: string) {
    super(
      "recurring.planned_column_fact.payload_invalid",
      `Un fait « ${type} » d'une colonne planifiée est illisible : la cloche du staff n'a pas ` +
        "sonné. L'issue de la colonne est bien inscrite. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
