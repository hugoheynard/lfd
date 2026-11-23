import { ORDER_OFFER_NATURES, type OrderOfferNature } from "@lfd/contracts";

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Noms stables des faits — des valeurs du journal : ils ne se renomment que par migration. */
export const ORDER_OFFERED = "order.offered";
export const ORDER_OFFER_REVALUED = "order.offer_revalued";

const NATURES: readonly string[] = ORDER_OFFER_NATURES.map((nature) => nature.key);

/**
 * **« L'équipe a offert cette commande »** (`la-commande-offerte.md`, § 2.6) —
 * écrit dans la boîte d'envoi, dans la transaction de la passation. Le texte
 * du motif n'y est pas : il peut nommer une personne, il reste sur la commande.
 * Clé `order.offered:<orderId>` : une commande n'est offerte qu'une fois.
 */
export class OrderOfferedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    readonly placedByUserId: string,
    readonly offeredByStaffId: string,
    readonly nature: OrderOfferNature,
    readonly offeredTotalCents: number,
    readonly offeredVatCents: number,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_OFFERED,
      key: `${ORDER_OFFERED}:${this.orderId}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        offeredByStaffId: this.offeredByStaffId,
        nature: this.nature,
        offeredTotalCents: this.offeredTotalCents,
        offeredVatCents: this.offeredVatCents,
      },
    };
  }

  /** @throws {OrderOfferFactPayloadError} une charge illisible. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderOfferedEvent {
    const read = reader(payload);
    const nature = read.text("nature");
    const values = {
      orderId: read.text("orderId"),
      orderNumber: read.text("orderNumber"),
      placedByUserId: read.text("placedByUserId"),
      offeredByStaffId: read.text("offeredByStaffId"),
      total: read.cents("offeredTotalCents"),
      vat: read.cents("offeredVatCents"),
    };
    if (
      values.orderId === null ||
      values.orderNumber === null ||
      values.placedByUserId === null ||
      values.offeredByStaffId === null ||
      values.total === null ||
      values.vat === null ||
      nature === null ||
      !isNature(nature)
    ) {
      throw new OrderOfferFactPayloadError(ORDER_OFFERED);
    }
    return new OrderOfferedEvent(
      values.orderId,
      values.orderNumber,
      values.placedByUserId,
      values.offeredByStaffId,
      nature,
      values.total,
      values.vat,
    );
  }
}

/**
 * **« La valeur offerte a changé »** — à chaque modification d'une commande
 * offerte, la valeur APRÈS le geste. Clé `…:<orderId>:<revision>`.
 */
export class OrderOfferRevaluedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    readonly placedByUserId: string,
    readonly revision: number,
    readonly offeredTotalCents: number,
    readonly offeredVatCents: number,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_OFFER_REVALUED,
      key: `${ORDER_OFFER_REVALUED}:${this.orderId}:${String(this.revision)}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        revision: this.revision,
        offeredTotalCents: this.offeredTotalCents,
        offeredVatCents: this.offeredVatCents,
      },
    };
  }

  /** @throws {OrderOfferFactPayloadError} une charge illisible. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderOfferRevaluedEvent {
    const read = reader(payload);
    const orderId = read.text("orderId");
    const orderNumber = read.text("orderNumber");
    const placedByUserId = read.text("placedByUserId");
    const revision = read.cents("revision");
    const total = read.cents("offeredTotalCents");
    const vat = read.cents("offeredVatCents");
    if (
      orderId === null ||
      orderNumber === null ||
      placedByUserId === null ||
      revision === null ||
      total === null ||
      vat === null
    ) {
      throw new OrderOfferFactPayloadError(ORDER_OFFER_REVALUED);
    }
    return new OrderOfferRevaluedEvent(orderId, orderNumber, placedByUserId, revision, total, vat);
  }
}

function isNature(value: string): value is OrderOfferNature {
  return NATURES.includes(value);
}

/** Un texte non vide, ou un entier positif ou nul ; `null` sinon. */
function reader(payload: Readonly<Record<string, unknown>>) {
  return {
    text(key: string): string | null {
      const value = payload[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    },
    cents(key: string): number | null {
      const value = payload[key];
      return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
    },
  };
}

/** Un fait de commande offerte illisible : aucun témoin n'est écrit, le message reste visible. */
export class OrderOfferFactPayloadError extends TechnicalError {
  constructor(type: string) {
    super(
      "order_offer_fact.payload_invalid",
      `Le fait « ${type} » reçu est illisible (commande, auteur ou montants manquants) : son ` +
        "témoin n'a pas été écrit au journal. Le message reste dans la boîte d'envoi ; corriger " +
        "l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
