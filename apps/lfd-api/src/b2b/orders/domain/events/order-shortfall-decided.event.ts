import type { ShortfallRemainder } from "@lfd/contracts";

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { DepartingQuantity } from "../entities/shortfall-decision.js";

/** Nom stable du fait — une valeur du journal : elle ne se renomme que par migration. */
export const ORDER_SHORTFALL_DECIDED = "order.shortfall_decided";

/** Les sorts du reste que le fait sait lire — `abandoned` seul jusqu'à E7. */
const REMAINDERS: readonly ShortfallRemainder[] = ["abandoned"];

/**
 * **« Le départ incomplet est décidé »** (plan
 * `documentation/commandes/plan-e6c2-la-facture-lit-les-montants-facturables.md`
 * § 5) — une décision d'argent prise par une personne : la facture lira ce qui
 * part, plus la commande. Écrit dans la boîte d'envoi, dans la transaction de
 * la décision ; le journal en garde le témoin (qui, ce qui part, le reste).
 *
 * Clé `order.shortfall_decided:<orderId>` : une décision par commande,
 * définitive (Q-I4).
 */
export class OrderShortfallDecidedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    readonly placedByUserId: string,
    readonly decidedByStaffId: string,
    readonly departing: readonly DepartingQuantity[],
    readonly remainder: ShortfallRemainder,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_SHORTFALL_DECIDED,
      key: `${ORDER_SHORTFALL_DECIDED}:${this.orderId}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        decidedByStaffId: this.decidedByStaffId,
        departing: this.departing.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        remainder: this.remainder,
      },
    };
  }

  /** @throws {OrderShortfallDecidedPayloadError} une charge illisible. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderShortfallDecidedEvent {
    const text = (key: string): string | null => {
      const value = payload[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    };
    const orderId = text("orderId");
    const orderNumber = text("orderNumber");
    const placedByUserId = text("placedByUserId");
    const decidedByStaffId = text("decidedByStaffId");
    const departing = departingOf(payload["departing"]);
    const remainder = REMAINDERS.find((known) => known === payload["remainder"]) ?? null;
    if (
      orderId === null ||
      orderNumber === null ||
      placedByUserId === null ||
      decidedByStaffId === null ||
      departing === null ||
      remainder === null
    ) {
      throw new OrderShortfallDecidedPayloadError();
    }
    return new OrderShortfallDecidedEvent(
      orderId,
      orderNumber,
      placedByUserId,
      decidedByStaffId,
      departing,
      remainder,
    );
  }
}

function departingOf(raw: unknown): DepartingQuantity[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const lines = raw.flatMap((item: unknown): DepartingQuantity[] => {
    if (item === null || typeof item !== "object") {
      return [];
    }
    const record = new Map<string, unknown>(Object.entries(item));
    const sku = record.get("sku");
    const quantity = record.get("quantity");
    return typeof sku === "string" && typeof quantity === "number" && Number.isInteger(quantity)
      ? [{ sku, quantity }]
      : [];
  });
  return lines.length === raw.length ? lines : null;
}

/** Un fait « départ décidé » illisible : aucun témoin n'est écrit, le message reste visible. */
export class OrderShortfallDecidedPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_shortfall_decided.payload_invalid",
      "Le fait « départ incomplet décidé » reçu est illisible (commande, auteur, quantités ou " +
        "reste manquants) : son témoin n'a pas été écrit au journal. Le message reste dans la " +
        "boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
