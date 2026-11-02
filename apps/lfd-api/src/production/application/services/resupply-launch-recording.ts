import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import type { PlacedResupply } from "../../channels/commerce/day-resupplies.reader.js";
import { ResupplyLaunchedEvent } from "../../channels/commerce/resupply-launched.event.js";
import type {
  ProductionDay,
  ProductionBatchSnapshot,
  ResupplyLaunchGesture,
} from "../../domain/entities/production-day.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Un lancement décidé par l'agrégat, prêt à écrire. */
export interface DecidedLaunch {
  readonly day: ServiceDay;
  readonly current: ProductionDay;
  readonly resupply: PlacedResupply;
  readonly gesture: ResupplyLaunchGesture;
  /** Les coches héritées matérialisées avant le lancement. */
  readonly inherited: readonly ProductionBatchSnapshot[];
  /** Le lancement a-t-il arrêté une journée jamais arrêtée ? */
  readonly openedPlan: boolean;
}

/**
 * **Écrit et annonce un lancement « au plus tôt »** — les fournées héritées,
 * la journée, puis le fait `production.resupply_launched` que le commerce
 * écoute (l'affichage, le colisage, la livraison). Sorti de
 * `LaunchResupplyHandler` (audit du réassort, 2026-11-02) ; à appeler dans
 * l'unité de travail du handler, sous le verrou de la journée. Le journal
 * reste au handler : c'est lui que la porte `lint:journal-tracked` lit.
 *
 * Il ne publie pas `production.day_closed`, même quand le lancement ouvre la
 * journée : le fait déclencherait l'envoi du dossier du jour. Le fait du
 * lancement le dit (`openedPlan`), et c'est par lui que la livraison apprend
 * l'arrêt.
 */
@Injectable()
export class ResupplyLaunchRecording {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly batches: ProductionBatchRepository,
    private readonly durable: DurablePublisher,
  ) {}

  async record(launch: DecidedLaunch): Promise<void> {
    const { day, current, resupply, gesture, openedPlan } = launch;
    for (const batch of launch.inherited) {
      await this.batches.record(day, batch);
    }
    await this.days.save(current);
    const reopenedAt = current.reopened?.at ?? null;
    await this.durable.publish(
      new ResupplyLaunchedEvent(
        day.value,
        gesture.at,
        gesture.staffUserId,
        gesture.name,
        resupply,
        reopenedAt,
        openedPlan,
      ).durableFact(),
    );
  }
}
