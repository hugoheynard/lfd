import type { ProductionWorksheetRetake } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import { ProductionDayRetakenJournalEvent } from "../../domain/events/production-day.events.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
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
  ) {}

  async execute(command: RetakeProductionDayCommand): Promise<ProductionWorksheetRetake> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    const producible = await this.orders.producibleFor(day);

    const absorbed = current.retake(producible, this.clock.now(), command.staffUserId);
    if (absorbed > 0) {
      await this.uow.run(async () => {
        await this.days.save(current);
        await this.events.publishTraced(new ProductionDayRetakenJournalEvent(day.value, absorbed));
      });
    }

    return {
      date: day.value,
      absorbed,
      // Le tirage que la fiche montre MAINTENANT : celui qu'on vient de
      // reprendre, ou le précédent quand il n'y avait rien à absorber. Aucun des
      // deux ne peut manquer — l'agrégat a déjà refusé une journée ouverte — mais
      // on le traite plutôt que de l'affirmer : un `!` dirait au compilateur de
      // se taire sur la seule chose qu'il sait.
      retakenAt: (current.retaken?.at ?? current.closedAt ?? this.clock.now()).toISOString(),
    };
  }
}
