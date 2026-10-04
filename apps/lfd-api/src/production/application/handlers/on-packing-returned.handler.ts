import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  PACKING_RETURNED,
  PackingReturnedEvent,
} from "../../channels/packing/packing-returned.event.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ProductionHandoffLedger } from "../../domain/ports/production-handoff.ledger.js";
import { ProductionReturnRequests } from "../../domain/ports/production-return.requests.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PACKING_RETURNED = "production.take-back-returned";

/**
 * **Le fournil reprend ce que le colisage lui a rendu** (plan
 * `colisage/plan-domaine-colisage.md`, §10.2, §13 B2, K2).
 *
 * La SEULE porte par laquelle « sorti » baisse sur une journée `packing` :
 *
 * 1. la demande reçoit sa réponse, une fois (conditionnée en base) ;
 * 2. une remise négative de ce qui est rendu entre au registre — « remis »
 *    baisse d'autant, et `sorti ≥ remis` tient (§11 SÉRIEUX) ;
 * 3. si la fournée a tout rendu, elle est annulée — signée par celui qui a
 *    demandé, à l'instant de la décision. Un retour partiel la laisse compter
 *    pour le reste ; un refus (`0`) ne change rien, et la fiche le montre.
 *
 * Sous le verrou de la journée, comme toute annulation de fournée (D4).
 */
@Injectable()
@DurableHandler({ type: PACKING_RETURNED, subscriber: ON_PACKING_RETURNED })
export class OnPackingReturned implements DurableSubscriber {
  constructor(
    private readonly requests: ProductionReturnRequests,
    private readonly ledger: ProductionHandoffLedger,
    private readonly days: ProductionDayRepository,
    private readonly batches: ProductionBatchRepository,
    private readonly lock: ProductionDayLock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = PackingReturnedEvent.fromPayload(delivery.payload);
    const day = ServiceDay.of(event.serviceDay);
    await this.lock.lock(day);
    const answered = await this.requests.answer(event.requestId, event.returned, event.decidedAt);
    if (answered === null || answered.returned === 0) {
      return;
    }
    await this.ledger.record(day, {
      id: event.requestId,
      sku: answered.sku,
      quantity: -answered.returned,
      source: "batch",
      at: event.decidedAt,
      by: answered.requested.by,
      requestId: event.requestId,
    });
    const batch = (await this.days.load(day)).batches.find(
      (candidate) => candidate.id === answered.batchId,
    );
    if (batch !== undefined && batch.returned >= batch.quantity) {
      await this.batches.cancel(day, batch.id, { at: event.decidedAt, by: answered.requested.by });
    }
  }
}
