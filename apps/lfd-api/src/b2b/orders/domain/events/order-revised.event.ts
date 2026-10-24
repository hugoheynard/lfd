import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import {
  REVISION_CHANGES,
  type RevisionActor,
  type RevisionChange,
} from "../entities/order-revision.js";

/** Nom stable du fait — une valeur du journal : elle ne se renomme que par migration. */
export const ORDER_REVISED = "order.revised";

/**
 * **« Une commande a été modifiée »** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1, §5) — écrit
 * dans la boîte d'envoi dans la transaction de la révision. Le journal en
 * garde le témoin (qui, quand, ce qui a changé, l'écart de total).
 *
 * Clé `order.revised:<orderId>:<révision>` : une révision n'arrive qu'une fois.
 */
export class OrderRevisedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    readonly placedByUserId: string,
    readonly revision: number,
    readonly author: RevisionActor,
    readonly changes: readonly RevisionChange[],
    readonly totalBeforeCents: number,
    readonly totalAfterCents: number,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_REVISED,
      key: `${ORDER_REVISED}:${this.orderId}:${String(this.revision)}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        revision: this.revision,
        author: { ...this.author },
        changes: [...this.changes],
        totalBeforeCents: this.totalBeforeCents,
        totalAfterCents: this.totalAfterCents,
      },
    };
  }

  /** @throws {OrderRevisedPayloadError} une charge illisible. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderRevisedEvent {
    const text = (key: string): string | null => {
      const value = payload[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    };
    const count = (key: string): number | null => {
      const value = payload[key];
      return typeof value === "number" && Number.isInteger(value) ? value : null;
    };
    const orderId = text("orderId");
    const orderNumber = text("orderNumber");
    const placedByUserId = text("placedByUserId");
    const revision = count("revision");
    const before = count("totalBeforeCents");
    const after = count("totalAfterCents");
    const author = authorOf(payload["author"]);
    const changes = changesOf(payload["changes"]);
    if (
      orderId === null ||
      orderNumber === null ||
      placedByUserId === null ||
      revision === null ||
      before === null ||
      after === null ||
      author === null ||
      changes === null
    ) {
      throw new OrderRevisedPayloadError();
    }
    return new OrderRevisedEvent(
      orderId,
      orderNumber,
      placedByUserId,
      revision,
      author,
      changes,
      before,
      after,
    );
  }
}

function authorOf(raw: unknown): RevisionActor | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const entries: readonly (readonly [string, unknown])[] = Object.entries(raw);
  const record = new Map<string, unknown>(entries);
  const kind = record.get("kind");
  const userId = record.get("userId");
  const staffId = record.get("staffId");
  if (kind === "customer" && typeof userId === "string" && userId.length > 0) {
    return { kind, userId };
  }
  if (kind === "staff" && typeof staffId === "string" && staffId.length > 0) {
    return { kind, staffId };
  }
  return null;
}

function changesOf(raw: unknown): RevisionChange[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const known: readonly string[] = REVISION_CHANGES;
  const changes = raw.filter(
    (value): value is RevisionChange => typeof value === "string" && known.includes(value),
  );
  return changes.length === raw.length ? changes : null;
}

/** Un fait « commande modifiée » illisible : aucun témoin n'est écrit, le message reste visible. */
export class OrderRevisedPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_revised.payload_invalid",
      "Le fait « commande modifiée » reçu est illisible (commande, révision, auteur ou changements " +
        "manquants) : son témoin n'a pas été écrit au journal. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
