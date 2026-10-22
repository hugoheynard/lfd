import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../channels/commerce/day-orders.reader.js";
import {
  DayResuppliesReader,
  type PlacedResupply,
} from "../../channels/commerce/day-resupplies.reader.js";
import { ResupplyLaunchedEvent } from "../../channels/commerce/resupply-launched.event.js";
import {
  NOTHING_PENDING,
  type PendingPlan,
  type ProductionDay,
  type ResupplyLaunchGesture,
} from "../../domain/entities/production-day.js";
import { ResupplyToLaunchNotFoundError } from "../../domain/errors/resupply-launch-errors.js";
import { ProductionResupplyLaunchedJournalEvent } from "../../domain/events/production-day.events.js";
import { OrderWithdrawalsReader } from "../../domain/ports/order-withdrawals.reader.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { LaunchResupplyCommand } from "./launch-resupply.command.js";

/**
 * **« Lancer » un réassort « au plus tôt »** (R4a,
 * `documentation/reassort-boutiques/plan-au-plus-tot.md` §2).
 *
 * ## Sous le verrou de la journée
 *
 * Il verrouille la journée, la RECHARGE, lit LE réassort au commerce
 * (`asapToLaunch`), demande à l'agrégat de le lancer, écrit, journalise et
 * publie — dans une unité de travail. L'annulation d'un « au plus tôt »
 * prend le même verrou (`LaunchedResupplies`) : un réassort annulé avant
 * n'est plus rendu par le commerce, et un réassort lancé avant ne s'annule
 * plus. Lire le commerce SOUS le verrou est la même exception que
 * `placedFor` à l'arrêt, pour la même raison.
 *
 * Les commandes du commerce et le nom de qui lance sont lus AVANT le
 * verrou, comme au retirage : elles ne servent qu'à la garde de Q5 (une
 * journée jamais arrêtée ne s'ouvre pas avec ce seul réassort s'il reste
 * des commandes à figer).
 *
 * ## Ce qu'il ne fait PAS
 *
 * Il ne renvoie pas le dossier du jour (Q6) et ne publie pas
 * `production.day_closed`, même quand il ouvre la journée : le fait
 * déclencherait l'envoi du dossier. Il publie `production.resupply_launched`,
 * que le commerce écoute pour l'affichage, le colisage (R4b) et la livraison
 * (R4c) ; quand le lancement ouvre la journée, le fait le dit (`openedPlan`),
 * et c'est par lui que la livraison apprend l'arrêt.
 */
@CommandHandler(LaunchResupplyCommand)
export class LaunchResupplyHandler implements ICommandHandler<LaunchResupplyCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly lock: ProductionDayLock,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly resupplies: DayResuppliesReader,
    private readonly orders: DayOrdersReader,
    private readonly withdrawals: OrderWithdrawalsReader,
    private readonly batches: ProductionBatchRepository,
    private readonly authors: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly durable: DurablePublisher,
  ) {}

  async execute(command: LaunchResupplyCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const producible = await this.orders.producibleFor(day);
    const name = (await this.authors.identify([command.staffUserId])).nameOf(command.staffUserId);
    await this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.days.load(day);
      const resupply = await this.resupplies.asapToLaunch(day, command.resupplyId);
      if (resupply === null) {
        throw new ResupplyToLaunchNotFoundError(day.value);
      }
      const gesture = { at: this.clock.now(), staffUserId: command.staffUserId, name };
      const pending = await this.pendingOf(day, current, producible);
      await this.launch(day, current, resupply, gesture, pending);
    });
  }

  /** Ce que l'arrêt figerait encore — rien sur une journée déjà arrêtée. */
  private async pendingOf(
    day: ServiceDay,
    current: ProductionDay,
    producible: readonly ProducibleOrder[],
  ): Promise<PendingPlan> {
    if (current.isClosed) {
      return NOTHING_PENDING;
    }
    return {
      orders: producible,
      withdrawn: await this.withdrawals.withdrawnOn(day),
      resupplies: await this.resupplies.placedFor(day),
    };
  }

  /**
   * Les coches héritées sont matérialisées AVANT : le compte se refait, et
   * une coche de l'ancien poste y serait perdue (§5.3 des fournées).
   */
  private async launch(
    day: ServiceDay,
    current: ProductionDay,
    resupply: PlacedResupply,
    gesture: ResupplyLaunchGesture,
    pending: PendingPlan,
  ): Promise<void> {
    const inherited = current.materialize();
    const openedPlan = current.launchResupply(resupply, gesture, pending);
    for (const batch of inherited) {
      await this.batches.record(day, batch);
    }
    await this.days.save(current);
    await this.events.publishTraced(
      new ProductionResupplyLaunchedJournalEvent(day.value, resupply, openedPlan),
    );
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
