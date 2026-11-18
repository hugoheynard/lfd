import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  HandedToPackingEvent,
  PRODUCTION_HANDED_TO_PACKING,
} from "../../../production/channels/packing/index.js";
import { PackingShadowLedger } from "../../domain/ports/packing-shadow.ledger.js";
import { PackingReturnDesk } from "../returns/packing-return-desk.service.js";
import { OutputCorrectionApplier } from "../corrections/output-correction-applier.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_HANDED_TO_PACKING = "packing.shadow.receive-handoff";

/**
 * **L'ombre reçoit une remise** — une fournée sortie (plan
 * `colisage/colisage.md`, K1, §11.2).
 *
 * La réserve `(jour, SKU)` gagne la quantité, une fois par `handoffId` — une
 * fournée déclarée deux fois n'est reçue qu'une fois. Elle ne dépend pas des
 * commandes : une remise avant la liste à coliser est gardée (§11, B3).
 *
 * Depuis K2, elle tranche aussi les demandes de retour qui l'attendaient
 * (« remise inconnue », §13) — dans la même unité de travail.
 *
 * Et une correction du fournil arrivée AVANT elle (D9 de
 * `colisage/plan-niveaux-de-suivi-colisage.md`) : la correction a attendu la
 * remise, la réception l'applique.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_HANDED_TO_PACKING, subscriber: ON_HANDED_TO_PACKING })
export class OnHandedToPacking implements DurableSubscriber {
  constructor(
    private readonly shadow: PackingShadowLedger,
    private readonly clock: Clock,
    private readonly desk: PackingReturnDesk,
    private readonly corrections: OutputCorrectionApplier,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = HandedToPackingEvent.fromPayload(delivery.payload);
    const fresh = await this.shadow.receive({
      id: event.handoffId,
      kind: "handoff",
      serviceDay: event.serviceDay,
      sku: event.sku,
      quantity: event.quantity,
      receivedAt: this.clock.now(),
    });
    if (fresh) {
      // Une demande de retour arrivée AVANT la remise l'attendait (K2, §13).
      await this.desk.settlePending(event.handoffId);
      await this.corrections.applyMatching(
        event.serviceDay,
        (correction) => correction.handoffId === event.handoffId,
      );
    }
  }
}
