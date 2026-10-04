import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, piecesOf, textOf } from "./payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_RETURN_REQUESTED = "production.return_requested";

/**
 * **Le fournil reprend des pièces qu'il avait remises** — l'annulation ou la
 * décoche d'une fournée déjà remise (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §12.1, §13, B2).
 *
 * ## `legacy`, et ce que le colisage en fait
 *
 * - `legacy: true` — la journée est colisée par l'ancien poste. Le fournil a
 *   DÉJÀ décidé, synchrone, comme avant : le colisage applique le retour sans
 *   répondre.
 * - `legacy: false` — une journée `packing` (K2) : c'est une DEMANDE, que le
 *   colisage tranchera et à laquelle il répondra par `packing.returned`. Le
 *   binaire de K1 n'en émet jamais.
 *
 * ## La clé
 *
 * `production.return_requested:<requestId>`, et `requestId` est déterministe
 * (`return-<id de la fournée>`) : une fournée ne s'annule qu'une fois.
 *
 * 🔴 **Il vit dans le CANAL** : le colisage le lit par ce dossier seulement.
 */
export class ReturnRequestedEvent implements DurableEvent {
  constructor(
    readonly requestId: string,
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly sku: string,
    /** Des pièces, toujours ≥ 1 — la quantité reprise, positive. */
    readonly quantity: number,
    readonly legacy: boolean,
    readonly requestedAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_RETURN_REQUESTED,
      key: `${PRODUCTION_RETURN_REQUESTED}:${this.requestId}`,
      payload: {
        requestId: this.requestId,
        serviceDay: this.serviceDay,
        sku: this.sku,
        quantity: this.quantity,
        legacy: this.legacy,
        requestedAt: this.requestedAt.toISOString(),
      },
    };
  }

  /** @throws {ReturnRequestedPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): ReturnRequestedEvent {
    const requestId = textOf(payload["requestId"]);
    const serviceDay = textOf(payload["serviceDay"]);
    const sku = textOf(payload["sku"]);
    const quantity = piecesOf(payload["quantity"]);
    const legacy = payload["legacy"];
    const requestedAt = instantOf(payload["requestedAt"]);
    if (
      requestId === null ||
      serviceDay === null ||
      sku === null ||
      quantity === null ||
      typeof legacy !== "boolean" ||
      requestedAt === null
    ) {
      throw new ReturnRequestedPayloadError();
    }
    return new ReturnRequestedEvent(requestId, serviceDay, sku, quantity, legacy, requestedAt);
  }
}

/** Le fait `production.return_requested` reçu ne respecte pas son contrat. */
export class ReturnRequestedPayloadError extends TechnicalError {
  constructor() {
    super(
      "return_requested.payload_invalid",
      "Le fait « retour demandé au colisage » reçu est illisible (demande, journée, article, " +
        "quantité, régime ou instant manquant) : le colisage n'a rien rendu. Le message reste dans " +
        "la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
