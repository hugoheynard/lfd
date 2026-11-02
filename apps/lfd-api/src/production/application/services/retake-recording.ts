import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { ProductionDayRetakenEvent } from "../../channels/delivery/index.js";
import type {
  ProductionBatchSnapshot,
  ProductionDay,
  ProductionOrderSnapshot,
} from "../../domain/entities/production-day.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { arrivalsBetween } from "../../domain/services/production-handoff.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ShipmentRef } from "../../domain/value-objects/shipment-ref.value-object.js";
import { packingListFactsOf } from "./packing-list-facts.js";

/** Un retirage décidé par l'agrégat, prêt à écrire. */
export interface DecidedRetake {
  readonly day: ServiceDay;
  /** Les commandes au plan AVANT le retirage — ce qui distingue les arrivées. */
  readonly before: readonly ProductionOrderSnapshot[];
  readonly current: ProductionDay;
  /** Les coches héritées, matérialisées avant le retirage. */
  readonly inherited: readonly ProductionBatchSnapshot[];
  readonly at: Date;
  readonly absorbed: number;
}

/**
 * **Écrit et annonce un retirage** — les coches héritées en fournées, la
 * journée, puis un `production.packing_list_drawn` par commande ARRIVÉE (sans
 * quoi elles n'arriveraient jamais à la liste à coliser) et
 * `production.day_retaken`, que le dossier complété et la livraison écoutent.
 * Sorti de `RetakeProductionDayHandler` (audit du réassort, 2026-11-02) ; à
 * appeler dans son unité de travail, sous le verrou de la journée. Le journal
 * reste au handler.
 */
@Injectable()
export class RetakeRecording {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly batches: ProductionBatchRepository,
    private readonly durable: DurablePublisher,
  ) {}

  async record(retake: DecidedRetake): Promise<void> {
    const { day, current, at } = retake;
    await this.batches.recordInherited(day, retake.inherited);
    await this.days.save(current);
    const arrivals = arrivalsBetween(retake.before, current.orders);
    const reopenedAt = current.reopened?.at ?? null;
    // La liste à coliser des seules arrivées, datée du retirage.
    for (const fact of packingListFactsOf(day, arrivals, at, reopenedAt)) {
      await this.durable.publish(fact.durableFact());
    }
    // Chaque arrivée est l'envoi `(commande, rang)` de sa ligne de plan.
    const shipments = arrivals.map((order) => ShipmentRef.of(order.orderId, order.rank));
    await this.durable.publish(
      new ProductionDayRetakenEvent(day.value, at, retake.absorbed, shipments).durableFact(),
    );
  }
}
