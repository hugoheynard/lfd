import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Nom stable du fait — une valeur du journal : elle ne se renomme que par migration. */
export const ORDER_BUDGET_COMMITMENT_CORRECTED = "order.budget_commitment_corrected";

/** L'engagement tel que le fait le porte ; `null` = aucun. */
export type CommitmentFact = { readonly number: string; readonly serviceCode: string } | null;

/**
 * **« L'engagement budgétaire de la commande est corrigé »** (E3′) — écrit
 * dans la boîte d'envoi, dans la transaction de la correction ; le journal
 * en garde le témoin (qui, avant, après). Clé `…:<orderId>:<correctionId>` :
 * chaque correction est un geste.
 */
export class OrderBudgetCommitmentCorrectedEvent implements DurableEvent {
  constructor(
    readonly correctionId: string,
    readonly orderId: string,
    readonly orderNumber: string,
    readonly placedByUserId: string,
    readonly correctedByStaffId: string,
    readonly before: CommitmentFact,
    readonly after: CommitmentFact,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_BUDGET_COMMITMENT_CORRECTED,
      key: `${ORDER_BUDGET_COMMITMENT_CORRECTED}:${this.orderId}:${this.correctionId}`,
      payload: {
        correctionId: this.correctionId,
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        correctedByStaffId: this.correctedByStaffId,
        before: this.before,
        after: this.after,
      },
    };
  }

  /** @throws {OrderBudgetCommitmentCorrectedPayloadError} une charge illisible. */
  static fromPayload(
    payload: Readonly<Record<string, unknown>>,
  ): OrderBudgetCommitmentCorrectedEvent {
    const text = (key: string): string | null => {
      const value = payload[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    };
    const correctionId = text("correctionId");
    const orderId = text("orderId");
    const orderNumber = text("orderNumber");
    const placedByUserId = text("placedByUserId");
    const correctedByStaffId = text("correctedByStaffId");
    const before = commitmentOf(payload["before"]);
    const after = commitmentOf(payload["after"]);
    if (
      correctionId === null ||
      orderId === null ||
      orderNumber === null ||
      placedByUserId === null ||
      correctedByStaffId === null ||
      before === undefined ||
      after === undefined
    ) {
      throw new OrderBudgetCommitmentCorrectedPayloadError();
    }
    return new OrderBudgetCommitmentCorrectedEvent(
      correctionId,
      orderId,
      orderNumber,
      placedByUserId,
      correctedByStaffId,
      before,
      after,
    );
  }
}

/** `undefined` : illisible. */
function commitmentOf(raw: unknown): CommitmentFact | undefined {
  if (raw === null) {
    return null;
  }
  if (typeof raw !== "object") {
    return undefined;
  }
  const record = new Map<string, unknown>(Object.entries(raw));
  const number = record.get("number");
  const serviceCode = record.get("serviceCode");
  return typeof number === "string" && typeof serviceCode === "string"
    ? { number, serviceCode }
    : undefined;
}

/** Un fait « engagement corrigé » illisible : aucun témoin n'est écrit, le message reste visible. */
export class OrderBudgetCommitmentCorrectedPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_budget_commitment_corrected.payload_invalid",
      "Le fait « engagement budgétaire corrigé » reçu est illisible (commande, auteur ou " +
        "engagement manquants) : son témoin n'a pas été écrit au journal. Le message reste dans " +
        "la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
