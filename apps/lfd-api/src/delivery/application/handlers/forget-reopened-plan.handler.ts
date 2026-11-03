import { Injectable, Logger } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  ArrestedPlanHold,
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
} from "../../../production/channels/delivery/index.js";
import { orderIdOf } from "../../domain/entities/delivery-round-state.js";
import { DeliveryDayReadinessRepository } from "../../domain/ports/delivery-day-readiness.repository.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { TransferAttachment } from "../transfer-attachment.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const FORGET_REOPENED_PLAN = "delivery.forget-reopened-plan";

/**
 * **La livraison oublie un plan rouvert** (Hugo, 2026-10-14).
 *
 * - le plan arrêté vu par la livraison (`DeliveryDayReadiness`) est oublié :
 *   la clôture suivante annoncera tout, comme une première ;
 * - les commandes du plan défait sortent des tournées AU DÉPÔT où la
 *   composition les avait posées — retirées par l'agrégat (`remove`), la
 *   ligne reste avec `removed_at`. Les tournées, même vides, restent : la
 *   prochaine composition les réutilise.
 *
 * - les RÉASSORTS du plan défait (`resupplyIds`, lot R3c) sortent de leur
 *   transfert encore prévu : ils n'y étaient entrés qu'à l'arrêt, et le
 *   fournil ne les a plus figés. Le transfert reste, même vide.
 *
 * Ce qu'il ne touche PAS : les arrêts de transfert, ni les commandes des
 * transferts. Un retrait d'un site servi par transfert y entre dès sa
 * PASSATION (`AttachOnOrderPlaced`), pas à l'arrêt : il reste une commande
 * valable du jour, et son transfert est toujours dû.
 *
 * Rien si la journée est de nouveau arrêtée quand le fait arrive (la boîte
 * d'envoi ne garantit pas l'ordre) : défaire défairait le nouveau plan. Une
 * tournée partie n'est jamais touchée — le fournil a refusé la réouverture
 * dans ce cas ; si elle part entre sa question et ce fait, on l'écrit au log.
 *
 * 🔴 **Sous verrous** (audit final du réassort, 2026-11-03). « De nouveau
 * arrêtée ? » se lit par `ArrestedPlanHold`, dans la transaction du reçu et
 * jusqu'à son `COMMIT` — un réarrêt en cours est attendu puis vu, un réarrêt
 * suivant attend ce retrait. Et une tournée n'est jugée « partie ou pas »
 * qu'une fois VERROUILLÉE et relue (`loadForDeparture`, le verrou même de
 * « Partir ») : lue avant, une tournée partie entre-temps faisait lever
 * `DeliveryRoundDepartedError` à `remove`, et l'abonné échouait à chaque
 * nouvel essai sans jamais finir.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_REOPENED, subscriber: FORGET_REOPENED_PLAN })
export class ForgetReopenedPlan implements DurableSubscriber {
  private readonly logger = new Logger(ForgetReopenedPlan.name);

  constructor(
    private readonly plan: ArrestedPlanHold,
    private readonly days: DeliveryDayReadinessRepository,
    private readonly reader: DeliveryRoundsReader,
    private readonly rounds: DeliveryRoundRepository,
    private readonly clock: Clock,
    private readonly attachment: TransferAttachment,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayReopenedEvent.fromPayload(delivery.payload);
    if ((await this.plan.hold(event.serviceDay)) === "arrested") {
      return;
    }
    const now = this.clock.now();
    const day = await this.days.load(event.serviceDay);
    if (day !== null) {
      day.forgetClosure(now);
      await this.days.save(day);
    }
    await this.removeStops(event.serviceDay, new Set(event.orderIds), now);
    await this.attachment.detachResupplies(event.serviceDay, event.resupplyIds);
  }

  /** Sort les commandes du plan défait des tournées du jour restées au dépôt. */
  private async removeStops(serviceDay: string, orderIds: ReadonlySet<string>, at: Date) {
    for (const row of await this.reader.roundsOn(serviceDay)) {
      const held = row.stops.some((stop) => orderIds.has(orderIdOf(stop) ?? ""));
      if (!held) {
        continue;
      }
      // Verrouillée puis relue : la lecture ci-dessus a pu précéder un départ.
      const round = await this.rounds.loadForDeparture(row.id);
      if (round === null) {
        continue;
      }
      if (round.departedAt !== null) {
        this.logger.warn(
          `Tournée ${round.id} du ${serviceDay} partie : ses arrêts restent malgré la réouverture.`,
        );
        continue;
      }
      for (const stop of round.liveStops) {
        if (orderIds.has(orderIdOf(stop) ?? "")) {
          round.remove(stop.id, at);
        }
      }
      await this.rounds.save(round);
    }
  }
}
