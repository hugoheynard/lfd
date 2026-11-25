import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ServiceDay } from "../../../day/index.js";
import { LineStep } from "../../domain/entities/line-step.js";
import { LineStepGestures } from "../services/line-step-gestures.service.js";
import { MarkStepDoneCommand } from "./mark-step-done.command.js";

/**
 * **« Étape faite »** (`documentation/fournil/un-produit-sur-plusieurs-postes.md`,
 * § 2.3) : la part du poste est cochée. Aucune pièce n'est comptée — seul
 * « Fait » du poste qui finit en déclare. Déjà faite : rien n'est écrit ni
 * journalisé.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
 * @throws {FinishingWorkstationIsNotAStepError} le poste finit la ligne.
 * @throws {WorkstationNotOnLineError} le poste n'est pas un poste du produit.
 */
@CommandHandler(MarkStepDoneCommand)
export class MarkStepDoneHandler implements ICommandHandler<MarkStepDoneCommand, void> {
  constructor(
    private readonly gestures: LineStepGestures,
    private readonly authors: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: MarkStepDoneCommand): Promise<void> {
    const key = {
      serviceDay: ServiceDay.of(command.serviceDay).value,
      sku: command.sku,
      workstationId: command.workstationId,
    };
    const name = (await this.authors.identify([command.staffUserId])).nameOf(command.staffUserId);
    await this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.line.step_done",
        subject: intentSubject(`${key.serviceDay}:${key.sku}:${key.workstationId}`),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const mark = { at: this.clock.now(), staffId: command.staffUserId, name };
          await this.gestures.apply(key, (known) =>
            known === null ? LineStep.checkDone(key, mark) : known.markDone(mark) ? known : null,
          );
          await seal(undefined);
        }),
    );
  }
}
