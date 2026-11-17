import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ProductionDayLock, ProductionDayRepository, ServiceDay } from "../../../day/index.js";
import type { ProductionDay } from "../../../day/index.js";
import {
  type ProblemMark,
  ProductionProblem,
  type ProductionProblemState,
} from "../../domain/entities/production-problem.js";
import {
  type ProblemOutcome,
  ProductionProblemReportedEvent,
} from "../../domain/events/production-problem.events.js";
import { ProductionProblemRepository } from "../../domain/ports/production-problem.ports.js";
import { BatchRecording } from "../services/batch-recording.service.js";
import { DayTrackingLevelsFreezing } from "../services/day-tracking-levels-freezing.service.js";
import { OutputCorrecting } from "../services/output-correcting.service.js";
import { ProblemBell } from "../services/problem-bell.js";
import { ReportProblemCommand } from "./report-problem.command.js";

/** Rien n'a été corrigé : le rouge a dit autant, ou plus, que sorti. */
const NOTHING_CORRECTED = { corrections: [], uncorrected: 0 } as const;

/**
 * **Le rouge** (`documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Une fois par intention, dans une unité de travail, sous le verrou de la
 * journée : le geste fige le niveau de suivi de la journée s'il ne l'est pas,
 * relit ce qui est sorti (part corrigée déduite), puis
 *
 * - **moins que sorti** : corrige l'écart sur les fournées remises de la
 *   ligne et publie `production.output_corrected` s'il a corrigé ;
 * - **plus que sorti** : déclare la différence par une fournée ordinaire ;
 *
 * pose ou remplace le problème (plafond, version), le journalise, et fait
 * sonner la cloche **après** la validation.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
 * @throws {InvalidProblemOutputError} le sorti n'est pas un entier ≥ 0.
 */
@CommandHandler(ReportProblemCommand)
export class ReportProblemHandler implements ICommandHandler<ReportProblemCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly lock: ProductionDayLock,
    private readonly freezing: DayTrackingLevelsFreezing,
    private readonly problems: ProductionProblemRepository,
    private readonly correcting: OutputCorrecting,
    private readonly recording: BatchRecording,
    private readonly events: DomainEventPublisher,
    private readonly bell: ProblemBell,
    private readonly authors: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: ReportProblemCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const name = (await this.authors.identify([command.staffUserId])).nameOf(command.staffUserId);
    await this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.problem.report",
        subject: intentSubject(`${day.value}:${command.sku}`, command.produced, command.reason),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          await this.report(day, command, {
            at: this.clock.now(),
            staffId: command.staffUserId,
            name,
          });
          await seal(undefined);
        }),
    );
  }

  private async report(day: ServiceDay, command: ReportProblemCommand, mark: ProblemMark) {
    await this.lock.lock(day);
    await this.freezing.freezeIfDue(day);
    const current = await this.days.load(day);
    const item = current.itemToMark(command.sku);
    const output = current.producedOf(command.sku);
    const problem = await this.posed(day, command, item.quantity, mark);
    const outcome = await this.applied(day, current, problem.state, output);
    await this.problems.save(problem);
    await this.events.publishTraced(
      new ProductionProblemReportedEvent(problem.state, {
        ...outcome,
        productName: item.productName,
      }),
    );
    this.bell.ringAfterCommit(problem.state, item.productName);
  }

  /** Le premier rouge de la ligne, ou le précédent remplacé. */
  private async posed(
    day: ServiceDay,
    command: ReportProblemCommand,
    expected: number,
    reported: ProblemMark,
  ): Promise<ProductionProblem> {
    const report = { expected, produced: command.produced, reason: command.reason, reported };
    const known = await this.problems.load(day, command.sku);
    if (known === null) {
      const identity = { id: this.ids.next(), serviceDay: day.value, sku: command.sku };
      return ProductionProblem.report(identity, report);
    }
    known.reportAgain(report);
    return known;
  }

  /** Ce que le rouge fait des fournées : corriger l'écart, ou déclarer le surplus. */
  private async applied(
    day: ServiceDay,
    current: ProductionDay,
    problem: ProductionProblemState,
    output: number,
  ): Promise<Omit<ProblemOutcome, "productName">> {
    if (problem.produced < output) {
      const gap = output - problem.produced;
      const correction = await this.correcting.correct(day, current, problem, gap);
      return { output, correction, declared: 0 };
    }
    const declared = problem.produced - output;
    if (declared > 0) {
      await this.recording.record(
        day,
        current,
        {
          id: `problem-${problem.id}-${String(problem.version)}`,
          sku: problem.sku,
          quantity: declared,
        },
        { at: problem.reported.at, by: problem.reported.staffId, initials: "" },
      );
    }
    return { output, correction: NOTHING_CORRECTED, declared };
  }
}
