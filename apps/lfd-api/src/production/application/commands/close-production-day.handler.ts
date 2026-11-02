import type { ProductionPlanClosure } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PendingSettlementSweeper } from "../../channels/commerce/pending-settlement.sweeper.js";
import {
  AUTOMATIC_SIGNER,
  type PlanSigner,
  staffSigner,
} from "../../domain/entities/plan-signer.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";
import { ProductionDayClosedJournalEvent } from "../../domain/events/production-day.events.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { refuseCloseBeforeCutoff } from "../../domain/services/early-close.js";
import { planStopOf } from "../../domain/services/latest-order-cutoff.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PlanArrestRecording } from "../services/plan-arrest-recording.js";
import { PlanIntakeReading } from "../services/plan-intake-reading.js";
import { PlanStopRules } from "../services/plan-stop-rules.js";
import { CloseProductionDayCommand } from "./close-production-day.command.js";

/**
 * **L'arrêt du plan du soir** — le moment où une journée bascule. Le pourquoi
 * de chaque étape (balayer d'abord, pourquoi un geste et pas un automate, la
 * réannonce, le journal et la boîte d'envoi dans la même transaction, la
 * liste à coliser) est dans `documentation/fournil/arret-du-plan.md`,
 * « Ce que fait un arrêt ».
 *
 * 1. Pas avant l'heure limite : refusé AVANT le balayage, qui annulerait les
 *    paiements de clients encore en train de commander (hors verrou).
 * 2. Le commerce tranche les règlements restés en l'air (hors verrou : il
 *    écrit chez lui), à CHAQUE appel, réannonce comprise.
 * 3. Sous le verrou de la journée, dans une unité de travail : la journée
 *    RECHARGÉE décide. Ouverte, elle s'arrête sur les retraits, les réassorts
 *    et les commandes lus sous le même verrou — la passation et l'envoi d'un
 *    réassort le prennent aussi, donc rien ne s'y glisse entre la lecture et
 *    l'arrêt. Déjà arrêtée, le fait est réannoncé sans rien recalculer (sauf
 *    une journée arrêtée par un lancement, qui n'en a jamais publié).
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
    private readonly reading: PlanIntakeReading,
    private readonly recording: PlanArrestRecording,
    private readonly settlements: PendingSettlementSweeper,
    private readonly stopRules: PlanStopRules,
    private readonly authors: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly lock: ProductionDayLock,
  ) {}

  async execute(command: CloseProductionDayCommand): Promise<ProductionPlanClosure> {
    const day = ServiceDay.of(command.serviceDay);
    // Hors verrou, l'en-tête seul : épargner la question de l'heure limite à
    // une journée déjà arrêtée. La décision se reprend sous le verrou.
    const alreadyClosed = await this.reading.isClosed(day);
    if (!alreadyClosed) {
      await this.refuseBeforeCutoff(day);
    }
    await this.settlements.sweep(day);
    // Résolu même pour une réannonce : une journée rouverte entre-temps se
    // trouve ouverte sous le verrou, et s'arrête alors signée, pas anonyme.
    const signer = await this.signerOf(command);
    return this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.reading.dayUnderLock(day);
      if (current.isClosed) {
        return this.reannounce(day, current);
      }
      return this.arrest(day, current, signer);
    });
  }

  /** Pas d'arrêt avant la fin du rattrapage de l'heure limite (`plan-une-seule-heure.md` §5). */
  private async refuseBeforeCutoff(day: ServiceDay): Promise<void> {
    const stop = planStopOf(await this.stopRules.rules(), day.value);
    refuseCloseBeforeCutoff(day.value, stop, this.clock.now());
  }

  /**
   * Qui arrête, nom FIGÉ maintenant (le papier ne bouge plus). Un arrêt
   * manuel sans fiche (un semis) reste anonyme : on n'invente pas d'auteur.
   */
  private async signerOf(command: CloseProductionDayCommand): Promise<PlanSigner | null> {
    if (command.trigger === "automatic") {
      return AUTOMATIC_SIGNER;
    }
    if (command.staffUserId === null) {
      return null;
    }
    const authors = await this.authors.identify([command.staffUserId]);
    return staffSigner(command.staffUserId, authors.nameOf(command.staffUserId));
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
