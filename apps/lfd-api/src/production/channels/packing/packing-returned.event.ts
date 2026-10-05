import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, textOf } from "./payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PACKING_RETURNED = "packing.returned";

/**
 * **Le colisage répond à une demande de retour** (plan
 * `documentation/colisage/colisage.md`, §12.1, §13 B2, K2).
 *
 * `returned` = ce qu'il rend : `min(demandé, reçu − rendu − au bac)`, décidé
 * chez lui, sous le verrou de sa réserve. `0` est un refus — tout est au bac —,
 * que le fournil affiche (Q5). « Remise inconnue » n'est PAS une réponse : le
 * colisage garde la demande et ne répond qu'à l'arrivée de la remise (§13).
 *
 * Seule sa réception fait baisser « sorti » au fournil, de `returned`.
 *
 * Clé : `packing.returned:<requestId>` — une demande, une réponse.
 */
export class PackingReturnedEvent implements DurableEvent {
  constructor(
    readonly requestId: string,
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    /** Des pièces, ≥ 0. */
    readonly returned: number,
    readonly decidedAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PACKING_RETURNED,
      key: `${PACKING_RETURNED}:${this.requestId}`,
      payload: {
        requestId: this.requestId,
        serviceDay: this.serviceDay,
        returned: this.returned,
        decidedAt: this.decidedAt.toISOString(),
      },
    };
  }

  /** @throws {PackingReturnedPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): PackingReturnedEvent {
    const requestId = textOf(payload["requestId"]);
    const serviceDay = textOf(payload["serviceDay"]);
    const returned = payload["returned"];
    const decidedAt = instantOf(payload["decidedAt"]);
    if (
      requestId === null ||
      serviceDay === null ||
      typeof returned !== "number" ||
      !Number.isInteger(returned) ||
      returned < 0 ||
      decidedAt === null
    ) {
      throw new PackingReturnedPayloadError();
    }
    return new PackingReturnedEvent(requestId, serviceDay, returned, decidedAt);
  }
}

/** Le fait `packing.returned` reçu ne respecte pas son contrat. */
export class PackingReturnedPayloadError extends TechnicalError {
  constructor() {
    super(
      "packing_returned.payload_invalid",
      "Le fait « réponse du colisage à un retour » reçu est illisible (demande, journée, quantité " +
        "rendue ou instant manquant) : le fournil n'a rien repris. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
