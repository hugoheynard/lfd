import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  OutputCorrectedEvent,
  PRODUCTION_OUTPUT_CORRECTED,
} from "../../../production/channels/packing/index.js";
import { OutputCorrectionApplier } from "../corrections/output-correction-applier.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_OUTPUT_CORRECTED = "packing.apply-output-correction";

/**
 * **Le fournil corrige sa déclaration** (D9 de
 * `colisage/plan-niveaux-de-suivi-colisage.md`) : la réserve `(jour, SKU)`
 * perd les pièces qui n'ont jamais existé.
 *
 * Le fait n'est qu'un signal : les corrections de l'article sont RELUES au
 * fournil (`OutputCorrectionsReader`), cumul par fournée. Ce qui n'avait pas
 * été couvert la fois précédente est donc retenté, et une fournée retirée
 * depuis n'est plus appliquée.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_OUTPUT_CORRECTED, subscriber: ON_OUTPUT_CORRECTED })
export class OnOutputCorrected implements DurableSubscriber {
  constructor(private readonly applier: OutputCorrectionApplier) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OutputCorrectedEvent.fromPayload(delivery.payload);
    await this.applier.applyMatching(event.serviceDay, (c) => c.sku === event.sku);
  }
}
