import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ProductionDayLock, ProductionDayRepository, ServiceDay } from "../../../day/index.js";
import { ProductionProblemRepository } from "../../domain/ports/production-problem.ports.js";
import { remainderUnderCeiling } from "../../domain/services/line-remainder.js";
import { BatchRecording } from "../services/batch-recording.service.js";
import { DayTrackingLevelsFreezing } from "../services/day-tracking-levels-freezing.service.js";
import { MarkLineDoneCommand } from "./mark-line-done.command.js";

/**
 * **« Fait »** (`documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Une fois par intention, dans une unité de travail, sous le verrou de la
 * journée : le geste fige le niveau de suivi de la journée s'il ne l'est pas,
 * puis déclare une fournée ordinaire du reste à sortir,
 * `min(compte, plafond) − sorti`, par le même service d'écriture qu'une
 * fournée de l'écran (`BatchRecording`). Une ligne déjà faite — ou déjà à son
 * plafond — ne déclare rien.
 *
 * L'`id` de la fournée est tiré ici (`done-<ULID>`) : l'intention scellée
 * absorbe le double appui, et un « Fait » rejoué sur une ligne faite ne
 * trouve plus de reste.
 *
 * @sans-journal geste d'atelier, comme une fournée de l'écran (plan de la
 * fiche, D7) : la dette du TODO `documentation/journalisation/todo-journal-activite.md`
 * s'en trouve élargie, et c'est dit.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
 */
@CommandHandler(MarkLineDoneCommand)
export class MarkLineDoneHandler implements ICommandHandler<MarkLineDoneCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly lock: ProductionDayLock,
    private readonly freezing: DayTrackingLevelsFreezing,
    private readonly problems: ProductionProblemRepository,
    private readonly recording: BatchRecording,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: MarkLineDoneCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    await this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.line.done",
        subject: intentSubject(`${day.value}:${command.sku}`),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          await this.markDone(day, command);
          await seal(undefined);
        }),
    );
  }

  private async markDone(day: ServiceDay, command: MarkLineDoneCommand): Promise<void> {
    await this.lock.lock(day);
    await this.freezing.freezeIfDue(day);
    const current = await this.days.load(day);
    const item = current.itemToMark(command.sku);
    const ceiling = (await this.problems.load(day, command.sku))?.state.produced ?? null;
    const rest = remainderUnderCeiling(item.quantity, ceiling, current.producedOf(command.sku));
    if (rest === 0) {
      return;
    }
    await this.recording.record(
      day,
      current,
      { id: `done-${this.ids.next()}`, sku: command.sku, quantity: rest },
      { at: this.clock.now(), by: command.staffUserId, initials: "" },
    );
  }
}
