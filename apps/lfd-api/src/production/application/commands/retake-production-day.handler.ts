import type { ProductionWorksheetRetake } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import type { ProductionOrderSnapshot } from "../../domain/entities/production-day.js";
import { ProductionDayRetakenEvent } from "../../domain/events/production-day-retaken.event.js";
import { ProductionDayRetakenJournalEvent } from "../../domain/events/production-day.events.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { arrivalsBetween } from "../../domain/services/production-handoff.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { packingListFactsOf } from "../services/packing-list-facts.js";
import { RetakeProductionDayCommand } from "./retake-production-day.command.js";

/**
 * **Le retirage** : la fiche reprend ce qui est arrivé depuis qu'elle est tirée.
 *
 * ## Ce que le handler ne fait PAS
 *
 * Il ne filtre pas les commandes déjà inscrites au plan, et ce n'est pas un
 * oubli : `ProductionDay.retake` les écarte lui-même, par `orderId` (vérifié le
 * 2026-09-13). Le refaire ici donnerait deux filtres pour un seul fait — et le
 * jour où l'un changerait, le bandeau annoncerait autre chose que ce que le
 * bouton absorbe.
 *
 * Il publie, en revanche, AU COLISAGE (2026-10-04, plan
 * `colisage/colisage.md`, §11, B2) : un `production.packing_list_drawn`
 * par commande ABSORBÉE, dans la même unité de travail — sans quoi elles
 * n'arriveraient jamais à la liste à coliser.
 *
 * Et AU FOURNIL lui-même (2026-10-06, plan `production/dossier-prod-du-jour.md`,
 * E3) : `production.day_retaken`, durable, dans la même unité de travail —
 * c'est lui qui fait repartir le dossier complété. Seulement quand des
 * commandes sont absorbées, comme tout le reste.
 *
 * Il ne publie rien AU COMMERCE. Un retirage n'inscrit aucune commande NOUVELLE
 * au commerce : celles qu'il absorbe sont les mêmes `placed` qu'une clôture
 * rejouée republierait, et c'est à la clôture de le faire. Le jour où l'on
 * voudra que le commerce apprenne un retirage, ce sera un événement de plus,
 * pas une branche ici.
 *
 * Il **journalise**, en revanche (depuis le 2026-09-19) : `production_day.retaken`
 * part dans la transaction de `save`, et un journal en panne annule le
 * retirage. La ligne de la journée ne garde que le DERNIER retirage ; le
 * journal les garde tous. Aucun abonné n'écoute ce fait sur le bus (vérifié le
 * 2026-09-19) : `publishTraced` ne prévient donc personne au commerce.
 *
 * ## Le verrou, et les coches héritées (plan des fournées, D4, §5.3)
 *
 * `save` réécrit le colisage de chaque ligne depuis l'instantané : chargé
 * AVANT, il effaçait un colisage validé pendant le retirage. La journée est
 * donc verrouillée puis RECHARGÉE dans l'unité de travail, et c'est cet
 * agrégat-là qu'on écrit. Les commandes du commerce, elles, sont lues avant :
 * pas de lecture d'un autre bloc sous un verrou tenu.
 *
 * Le retirage est le seul geste qui change une quantité. Avant d'absorber, il
 * écrit en vraies fournées les coches héritées (même `id` que le rattrapage) :
 * sans ça, 30 cochés puis 30 → 42 deviendraient 42 sortis.
 *
 * ## Zéro absorbé
 *
 * Ce n'est pas une erreur — c'est le cas de deux personnes qui pressent le même
 * bouton, ou d'un écran ouvert depuis un moment. Rien n'est écrit — ni la
 * journée, ni un fait —, et la réponse rend le tirage que la fiche montre déjà.
 * Même figure qu'`alreadyClosed`.
 *
 * @throws {ProductionDayNotClosedError} rien n'est arrêté : il n'y a pas de
 *   tirage à reprendre.
 */
@CommandHandler(RetakeProductionDayCommand)
export class RetakeProductionDayHandler implements ICommandHandler<
  RetakeProductionDayCommand,
  ProductionWorksheetRetake
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly orders: DayOrdersReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly batches: ProductionBatchRepository,
    private readonly lock: ProductionDayLock,
    private readonly durable: DurablePublisher,
    private readonly authors: StaffAuthorDirectory,
  ) {}

  async execute(command: RetakeProductionDayCommand): Promise<ProductionWorksheetRetake> {
    const day = ServiceDay.of(command.serviceDay);
    const producible = await this.orders.producibleFor(day);
    // Hors du verrou, comme toute lecture d'un autre bloc : le nom est FIGÉ au
    // retirage, le dossier dit « complété par … » sans relire l'annuaire.
    const byName = (await this.authors.identify([command.staffUserId])).nameOf(command.staffUserId);

    const outcome = await this.uow.run(async () => {
      await this.lock.lock(day);
      const locked = await this.days.load(day);
      const inherited = locked.materialize();
      const before = locked.orders;
      const now = this.clock.now();
      const absorbed = locked.retake(producible, now, command.staffUserId, byName);
      if (absorbed > 0) {
        for (const batch of inherited) {
          await this.batches.record(day, batch);
        }
        await this.days.save(locked);
        await this.events.publishTraced(new ProductionDayRetakenJournalEvent(day.value, absorbed));
        await this.publishArrivals(day, arrivalsBetween(before, locked.orders), now);
        await this.durable.publish(
          new ProductionDayRetakenEvent(day.value, now, absorbed).durableFact(),
        );
      }
      return { day: locked, absorbed };
    });
    return {
      date: day.value,
      absorbed: outcome.absorbed,
      // Le tirage que la fiche montre MAINTENANT : celui qu'on vient de
      // reprendre, ou le précédent quand il n'y avait rien à absorber. Aucun des
      // deux ne peut manquer — l'agrégat a déjà refusé une journée ouverte — mais
      // on le traite plutôt que de l'affirmer : un `!` dirait au compilateur de
      // se taire sur la seule chose qu'il sait.
      retakenAt: (
        outcome.day.retaken?.at ??
        outcome.day.closedAt ??
        this.clock.now()
      ).toISOString(),
    };
  }

  /** Les commandes absorbées entrent dans la liste à coliser, datées du retirage. */
  private async publishArrivals(
    day: ServiceDay,
    arrivals: readonly ProductionOrderSnapshot[],
    drawnAt: Date,
  ): Promise<void> {
    for (const fact of packingListFactsOf(day, arrivals, drawnAt)) {
      await this.durable.publish(fact.durableFact());
    }
  }
}
