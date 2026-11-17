import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ProductionDayLock, ProductionDayRepository, ServiceDay } from "../../../day/index.js";
import type { ProductionProblem } from "../../domain/entities/production-problem.js";
import { ProductionProblemNotFoundError } from "../../domain/errors/problem-errors.js";
import { ProductionProblemResolvedEvent } from "../../domain/events/production-problem.events.js";
import { ProductionProblemRepository } from "../../domain/ports/production-problem.ports.js";
import { ResolveProblemCommand } from "./resolve-problem.command.js";

/**
 * **« Marquer traité »** (plan `documentation/fournil/plan-niveaux-de-suivi.md`,
 * § 3.8).
 *
 * Une fois par intention, sous le verrou de la journée du problème — le même
 * que le rouge, qui le remplace et le rouvre : le problème est relu SOUS lui,
 * puis `resolve` pose l'instant et l'auteur. Déjà traité : rien n'est écrit ni
 * journalisé. Le plafond reste.
 *
 * @throws {ProductionProblemNotFoundError} aucun problème sous cet identifiant.
 */
@CommandHandler(ResolveProblemCommand)
export class ResolveProblemHandler implements ICommandHandler<ResolveProblemCommand, void> {
  constructor(
    private readonly problems: ProductionProblemRepository,
    private readonly days: ProductionDayRepository,
    private readonly lock: ProductionDayLock,
    private readonly events: DomainEventPublisher,
    private readonly authors: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: ResolveProblemCommand): Promise<void> {
    const name = (await this.authors.identify([command.staffUserId])).nameOf(command.staffUserId);
    await this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.problem.resolve",
        subject: intentSubject(command.problemId),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const day = ServiceDay.of((await this.found(command.problemId)).state.serviceDay);
          await this.lock.lock(day);
          const problem = await this.found(command.problemId);
          const mark = { at: this.clock.now(), staffId: command.staffUserId, name };
          if (problem.resolve(mark)) {
            await this.problems.save(problem);
            const current = await this.days.load(day);
            const productName =
              current.counts.find((item) => item.sku === problem.state.sku)?.productName ??
              problem.state.sku;
            await this.events.publishTraced(
              new ProductionProblemResolvedEvent(problem.state, productName),
            );
          }
          await seal(undefined);
        }),
    );
  }

  private async found(id: string): Promise<ProductionProblem> {
    const problem = await this.problems.loadById(id);
    if (problem === null) {
      throw new ProductionProblemNotFoundError(id);
    }
    return problem;
  }
}
