import type { ProductionPlanReopening } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { ProductionDayReopenedEvent } from "../../channels/commerce/production-day-reopened.event.js";
import { DayDispatchProgressReader } from "../../channels/delivery/day-dispatch-progress.reader.js";
import { DayPackingProgressReader } from "../../channels/packing/day-packing-progress.reader.js";
import type { DownstreamProgress } from "../../domain/entities/production-day.js";
import { ProductionDayReopenedJournalEvent } from "../../domain/events/production-day.events.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ReopenProductionDayCommand } from "./reopen-production-day.command.js";

/**
 * **La réouverture d'une journée arrêtée** (Hugo, 2026-10-14,
 * `documentation/plan-de-lancement-2026-11-20.md`, §3).
 *
 * ## Ce qu'il fait
 *
 * Demande au colisage et à la livraison si quelque chose a commencé — AVANT
 * le verrou : pas de lecture d'un autre bloc sous un verrou tenu, même règle
 * que la clôture et le retirage. Puis, dans une unité de travail : verrouille
 * la journée (le verrou de l'arrêt et du retirage), la RECHARGE, lui demande
 * de se rouvrir — c'est elle qui refuse —, l'écrit, journalise
 * `production_day.reopened` avec son auteur, et publie le fait durable
 * `production.day_reopened`. Les trois, ou aucun.
 *
 * ## Ce qu'il ne fait PAS
 *
 * Il n'écrit rien chez le commerce, le colisage ni la livraison : chacun
 * défait ce qui est à lui, en écoutant le fait. Le fournil publie, il ne sait
 * pas qui écoute.
 *
 * ⚠️ La lecture d'aval précède le verrou : un colisage qui commence dans
 * l'intervalle n'est pas vu ici. Les abonnés en tiennent compte — le colisage
 * ne retire que les commandes que personne n'a touchées.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {ReopenAfterBatchesError} @throws {ReopenAfterPackingError}
 * @throws {ReopenAfterDispatchError}
 */
@CommandHandler(ReopenProductionDayCommand)
export class ReopenProductionDayHandler implements ICommandHandler<
  ReopenProductionDayCommand,
  ProductionPlanReopening
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly lock: ProductionDayLock,
    private readonly packing: DayPackingProgressReader,
    private readonly dispatch: DayDispatchProgressReader,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
    private readonly durable: DurablePublisher,
  ) {}

  async execute(command: ReopenProductionDayCommand): Promise<ProductionPlanReopening> {
    const day = ServiceDay.of(command.serviceDay);
    const progress: DownstreamProgress = {
      packingStarted: await this.packing.startedOn(day.value),
      dispatchStarted: await this.dispatch.startedOn(day.value),
    };
    return this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.days.load(day);
      const closedAt = current.closedAt;
      // Lus AVANT `reopen`, qui les efface (lot R3a) : le fait les nomme.
      const resupplyIds = current.resupplies.map((resupply) => resupply.resupplyId);
      const now = this.clock.now();
      const released = current.reopen(progress, now, command.staffUserId);
      await this.days.save(current);
      await this.events.publishTraced(
        new ProductionDayReopenedJournalEvent(day.value, released.length),
      );
      // `closedAt` n'est pas nul : `reopen` a refusé une journée ouverte. On le
      // traite plutôt que de l'affirmer, comme la réannonce de la clôture.
      await this.durable.publish(
        new ProductionDayReopenedEvent(
          day.value,
          now,
          closedAt ?? now,
          released,
          resupplyIds,
        ).durableFact(),
      );
      return { date: day.value, released: released.length, reopenedAt: now.toISOString() };
    });
  }
}
