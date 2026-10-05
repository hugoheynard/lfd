import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, piecesOf, textOf } from "./payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_HANDED_TO_PACKING = "production.handed_to_packing";

/**
 * **Le fournil remet des pièces au colisage** — la sortie d'une fournée (plan
 * `documentation/colisage/colisage.md`, §11.2 : la remise EST la
 * sortie du four ; §13, B3).
 *
 * ## Le contrat
 *
 * `{ handoffId, serviceDay, sku, quantity, handedAt }`. `handoffId` est l'`id`
 * de la fournée : une déclaration rejouée calcule le même, donc le fait ne
 * s'écrit qu'une fois. Une fournée implicite (coche héritée) n'est JAMAIS
 * publiée.
 *
 * ## La clé
 *
 * `production.handed_to_packing:<handoffId>` — une fournée, une remise.
 *
 * 🔴 **Il vit dans le CANAL** : le colisage le lit, et `lint:context-boundaries`
 * n'autorise `packing → production` que par ce dossier.
 */
export class HandedToPackingEvent implements DurableEvent {
  constructor(
    /** L'`id` de la fournée — la clé d'idempotence côté colisage. */
    readonly handoffId: string,
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly sku: string,
    /** Des pièces, toujours ≥ 1. */
    readonly quantity: number,
    /** L'instant de la déclaration, celui du fournil. */
    readonly handedAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_HANDED_TO_PACKING,
      key: `${PRODUCTION_HANDED_TO_PACKING}:${this.handoffId}`,
      payload: {
        handoffId: this.handoffId,
        serviceDay: this.serviceDay,
        sku: this.sku,
        quantity: this.quantity,
        handedAt: this.handedAt.toISOString(),
      },
    };
  }

  /** @throws {HandedToPackingPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): HandedToPackingEvent {
    const handoffId = textOf(payload["handoffId"]);
    const serviceDay = textOf(payload["serviceDay"]);
    const sku = textOf(payload["sku"]);
    const quantity = piecesOf(payload["quantity"]);
    const handedAt = instantOf(payload["handedAt"]);
    if (
      handoffId === null ||
      serviceDay === null ||
      sku === null ||
      quantity === null ||
      handedAt === null
    ) {
      throw new HandedToPackingPayloadError();
    }
    return new HandedToPackingEvent(handoffId, serviceDay, sku, quantity, handedAt);
  }
}

/** Le fait `production.handed_to_packing` reçu ne respecte pas son contrat. */
export class HandedToPackingPayloadError extends TechnicalError {
  constructor() {
    super(
      "handed_to_packing.payload_invalid",
      "Le fait « remise au colisage » reçu est illisible (remise, journée, article, quantité ou instant " +
        "manquant) : le colisage n'a rien reçu. Le message reste dans la boîte d'envoi ; corriger " +
        "l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
