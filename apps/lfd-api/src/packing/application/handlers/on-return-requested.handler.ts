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
import { PackingShadowLedger } from "../../domain/ports/packing-shadow.ledger.js";
import { PackingReturnDesk } from "../returns/packing-return-desk.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_RETURN_REQUESTED = "packing.shadow.apply-return";

/**
 * **Le colisage reçoit un retour du fournil** (plan
 * `colisage/plan-domaine-colisage.md`, §13 B2 ; K1 puis K2).
 *
 * - `legacy: true` — une journée de l'ancien poste : le fournil a DÉJÀ annulé,
 *   synchrone. Le colisage applique le retour à sa réserve, une fois par
 *   `requestId`, et ne répond pas.
 * - `legacy: false` — une journée `packing` (K2) : c'est une DEMANDE. Le guichet
 *   la tranche sous le verrou de la réserve et répond par `packing.returned` ;
 *   si la remise visée n'est pas encore arrivée, la demande attend (§13).
 *
 * Le nom d'abonné reste celui de K1 : il est la clé des reçus déjà posés.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_RETURN_REQUESTED, subscriber: ON_RETURN_REQUESTED })
export class OnReturnRequested implements DurableSubscriber {
  constructor(
    private readonly shadow: PackingShadowLedger,
    private readonly clock: Clock,
    private readonly desk: PackingReturnDesk,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ReturnRequestedEvent.fromPayload(delivery.payload);
    if (!event.legacy) {
      await this.desk.receive({
        requestId: event.requestId,
        serviceDay: event.serviceDay,
        sku: event.sku,
        handoffId: event.handoffOfRequest(),
        requested: event.quantity,
        receivedAt: this.clock.now(),
      });
      return;
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
