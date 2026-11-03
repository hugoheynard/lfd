import type { ProductionPlanClosure } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import type { PlanSigner } from "../../domain/entities/plan-signer.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";
import { ProductionDayClosedJournalEvent } from "../../domain/events/production-day.events.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PlanArrestAdmission } from "../services/plan-arrest-admission.js";
import { PlanArrestRecording } from "../services/plan-arrest-recording.js";
import { PlanIntakeReading } from "../services/plan-intake-reading.js";
import { CloseProductionDayCommand } from "./close-production-day.command.js";

/**
 * **L'arrêt du plan du soir** — le moment où une journée bascule. Le pourquoi
 * de chaque étape (balayer d'abord, pourquoi un geste et pas un automate, la
 * réannonce, le journal et la boîte d'envoi dans la même transaction, la
 * liste à coliser) est dans `documentation/fournil/arret-du-plan.md`,
 * « Ce que fait un arrêt ».
 *
 * 1. Hors verrou ({@link PlanArrestAdmission.beforeLock}) : l'heure limite,
 *    contrôlée si la journée paraît ouverte — pour épargner le balayage à un
 *    arrêt anticipé, sans rien décider —, puis le balayage des règlements
 *    restés en l'air (il écrit chez le commerce), puis le signataire.
 * 2. Sous le verrou de la journée, dans une unité de travail : la journée
 *    RECHARGÉE décide. Ouverte, l'heure limite est contrôlée DE NOUVEAU — une
 *    réouverture validée pendant l'attente du verrou la rendait contournable
 *    (corrigé le 2026-11-03, `production-day-close-race.e2e-spec.ts`) —, puis
 *    elle s'arrête sur les retraits, les réassorts et les commandes lus sous
 *    le même verrou. Déjà arrêtée, le fait est réannoncé sans rien recalculer
 *    (sauf une journée arrêtée par un lancement, qui n'en a jamais publié).
 *
 * L'accusé rendu (`ProductionPlanClosure`) n'est pas un modèle de lecture :
 * cf. `CloseProductionDayCommand`.
 */
@CommandHandler(CloseProductionDayCommand)
export class CloseProductionDayHandler implements ICommandHandler<
  CloseProductionDayCommand,
  ProductionPlanClosure
> {
  constructor(
    private readonly admission: PlanArrestAdmission,
    private readonly reading: PlanIntakeReading,
    private readonly recording: PlanArrestRecording,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly lock: ProductionDayLock,
  ) {}

  async execute(command: CloseProductionDayCommand): Promise<ProductionPlanClosure> {
    const day = ServiceDay.of(command.serviceDay);
    const admitted = await this.admission.beforeLock(day, command);
    return this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.reading.dayUnderLock(day);
      if (current.isClosed) {
        return this.reannounce(day, current);
      }
      this.admission.refuseUnderLock(day, admitted);
      return this.arrest(day, current, admitted.signer);
    });
  }

  /** Sous le verrou, sur la journée relue ouverte. */
  private async arrest(
    day: ServiceDay,
    current: ProductionDay,
    signer: PlanSigner | null,
  ): Promise<ProductionPlanClosure> {
    const { producible, withdrawn, resupplies } = await this.reading.arrestUnderLock(day);
    const now = this.clock.now();
    current.close(producible, withdrawn, now, signer, resupplies);
    await this.recording.record(day, current, now);
    await this.events.publishTraced(
      new ProductionDayClosedJournalEvent(
        day.value,
        current.orders.length,
        signer?.kind === "automatic",
      ),
    );
    return report(day, now, current.orders.length, false);
  }

  /**
   * Sous le verrou, sur la journée relue arrêtée : un retirage concurrent ne
   * fait pas republier un instantané d'avant lui. Aucun fait au journal — un
   * second « arrêtée » mentirait sur l'heure et l'auteur.
   */
  private async reannounce(
    day: ServiceDay,
    current: ProductionDay,
  ): Promise<ProductionPlanClosure> {
    const now = this.clock.now();
    // `closedAt` n'est pas nul : la journée est arrêtée. On le traite plutôt
    // que de l'affirmer — un `!` ferait taire le compilateur sur ce qu'il sait.
    const at = current.closedAt ?? now;
    await this.recording.republish(day, current, at, now);
    return report(day, at, current.orders.length, true);
  }
}

function report(
  day: ServiceDay,
  closedAt: Date,
  orderCount: number,
  alreadyClosed: boolean,
): ProductionPlanClosure {
  return { date: day.value, absorbed: orderCount, alreadyClosed, closedAt: closedAt.toISOString() };
}
