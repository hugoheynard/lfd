import type { ProductionWorksheetRetake } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { ProductionDayRetakenJournalEvent } from "../../domain/events/production-day.events.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PlanIntakeReading } from "../services/plan-intake-reading.js";
import { RetakeRecording } from "../services/retake-recording.js";
import { RetakeProductionDayCommand } from "./retake-production-day.command.js";

/**
 * **Le retirage** : la fiche reprend ce qui est arrivé depuis qu'elle est tirée.
 *
 * Sous le verrou de la journée, dans une unité de travail : la journée
 * RECHARGÉE (chargée avant, un geste concurrent était effacé par `save`), les
 * coches héritées matérialisées AVANT d'absorber (sans quoi 30 cochés puis
 * 30 → 42 deviendraient 42 sortis), puis les retraits et les commandes lus
 * sous le même verrou que la passation — une commande admise entre une
 * lecture faite avant et le verrou manquait au tirage (corrigé le 2026-11-02).
 *
 * Il ne filtre pas les commandes déjà au plan : `ProductionDay.retake` les
 * écarte par `orderId` (vérifié le 2026-11-02). Deux filtres pour un fait
 * finiraient par diverger. Ce qu'il écrit et publie — fournées héritées,
 * journée, liste à coliser des arrivées, `production.day_retaken` — est dans
 * {@link RetakeRecording} ; il journalise `production_day.retaken` dans la
 * même transaction. Il ne publie rien AU COMMERCE : les commandes absorbées
 * sont des `placed` qu'une réannonce de l'arrêt lui apprend.
 *
 * **Zéro absorbé** n'est pas une erreur — deux personnes qui pressent le même
 * bouton : rien n'est écrit, et l'accusé rend le tirage que la fiche montre
 * déjà (cf. `RetakeProductionDayCommand`).
 *
 * @throws {ProductionDayNotClosedError} rien n'est arrêté : pas de tirage à reprendre.
 */
@CommandHandler(RetakeProductionDayCommand)
export class RetakeProductionDayHandler implements ICommandHandler<
  RetakeProductionDayCommand,
  ProductionWorksheetRetake
> {
  constructor(
    private readonly reading: PlanIntakeReading,
    private readonly recording: RetakeRecording,
    private readonly authors: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly lock: ProductionDayLock,
  ) {}

  async execute(command: RetakeProductionDayCommand): Promise<ProductionWorksheetRetake> {
    const day = ServiceDay.of(command.serviceDay);
    // Hors du verrou, comme toute lecture d'annuaire : le nom est FIGÉ au
    // retirage, le dossier dit « complété par … » sans relire l'annuaire.
    const byName = (await this.authors.identify([command.staffUserId])).nameOf(command.staffUserId);

    const current = await this.uow.run(async () => {
      await this.lock.lock(day);
      const locked = await this.reading.dayUnderLock(day);
      const inherited = locked.materialize();
      const before = locked.orders;
      const { withdrawn, producible } = await this.reading.retakeUnderLock(day);
      const now = this.clock.now();
      const absorbed = locked.retake(producible, withdrawn, now, command.staffUserId, byName);
      if (absorbed > 0) {
        await this.recording.record({ day, before, current: locked, inherited, at: now, absorbed });
        await this.events.publishTraced(new ProductionDayRetakenJournalEvent(day.value, absorbed));
      }
      return { locked, absorbed };
    });
    return {
      date: day.value,
      absorbed: current.absorbed,
      // Le tirage que la fiche montre MAINTENANT : celui qu'on vient de
      // reprendre, ou le précédent. Aucun ne peut manquer — l'agrégat a refusé
      // une journée ouverte — mais on le traite plutôt que de l'affirmer.
      retakenAt: (
        current.locked.retaken?.at ??
        current.locked.closedAt ??
        this.clock.now()
      ).toISOString(),
    };
  }
}
