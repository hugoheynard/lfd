import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  PRODUCTION_RETURN_REQUESTED,
  ReturnRequestedEvent,
} from "../../../production/channels/packing/index.js";
import { ReturnDecisionNotYetServedError } from "../../domain/errors/packing-shadow-errors.js";
import { PackingShadowLedger } from "../../domain/ports/packing-shadow.ledger.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_RETURN_REQUESTED = "packing.shadow.apply-return";

/**
 * **L'ombre rend ce que le fournil a repris** (plan
 * `colisage/plan-domaine-colisage.md`, K1, §13 B2).
 *
 * - `legacy: true` — le fournil a déjà annulé, synchrone, sous la garde de
 *   l'ancien poste : l'ombre applique le retour, une fois par `requestId`, et
 *   ne répond pas.
 * - `legacy: false` — une demande sur une journée `packing` (K2), qui appelle
 *   une décision et une réponse (`packing.returned`). Le binaire de K1 n'en
 *   émet jamais ; s'il en arrivait une, l'ombre ne la trancherait PAS à la
 *   place du colisage réel, et ne la perdrait pas non plus : elle échoue, et
 *   reste visible dans la boîte d'envoi.
 *
 * @throws {ReturnDecisionNotYetServedError} une demande `legacy: false`.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_RETURN_REQUESTED, subscriber: ON_RETURN_REQUESTED })
export class OnReturnRequested implements DurableSubscriber {
  constructor(
    private readonly shadow: PackingShadowLedger,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ReturnRequestedEvent.fromPayload(delivery.payload);
    if (!event.legacy) {
      throw new ReturnDecisionNotYetServedError(event.requestId);
    }
    await this.shadow.receive({
      id: event.requestId,
      kind: "return",
      serviceDay: event.serviceDay,
      sku: event.sku,
      quantity: event.quantity,
      receivedAt: this.clock.now(),
    });
  }
}
