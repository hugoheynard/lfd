import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ServiceDay } from "../../../day/index.js";
import { LineStepGestures } from "../services/line-step-gestures.service.js";
import { UndoStepCommand } from "./undo-step.command.js";

/**
 * **Décocher une étape** (`documentation/fournil/un-produit-sur-plusieurs-postes.md`,
 * § 2.3) : sous le même droit que « Fait », tant que la journée est
 * arrêtée. L'étape reste en base, `undone`, sa version monte. Jamais touchée
 * ou déjà décochée : rien n'est écrit ni journalisé.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
 * @throws {FinishingWorkstationIsNotAStepError} le poste finit la ligne.
 * @throws {WorkstationNotOnLineError} le poste n'est pas un poste du produit.
 */
@CommandHandler(UndoStepCommand)
export class UndoStepHandler implements ICommandHandler<UndoStepCommand, void> {
  constructor(
    private readonly gestures: LineStepGestures,
    private readonly authors: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: UndoStepCommand): Promise<void> {
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
        gesture: "production.line.step_undo",
        subject: intentSubject(`${key.serviceDay}:${key.sku}:${key.workstationId}`),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const mark = { at: this.clock.now(), staffId: command.staffUserId, name };
          await this.gestures.apply(key, (known) =>
            known !== null && known.undo(mark) ? known : null,
          );
          await seal(undefined);
        }),
    );
  }
}
