import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ServiceDay } from "../../../day/index.js";
import { LineStep } from "../../domain/entities/line-step.js";
import { LineStepGestures } from "../services/line-step-gestures.service.js";
import { MarkStepRedCommand } from "./mark-step-red.command.js";

/**
 * **Le rouge d'une étape** (`documentation/fournil/un-produit-sur-plusieurs-postes.md`,
 * § 1 et § 2.11, point 6) : sans plafond, il ne touche aucune fournée ; la
 * Supervision le montre dans la liste des problèmes, marqué « étape ». Déjà
 * en rouge pour la même raison : rien n'est écrit ni journalisé.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
 * @throws {FinishingWorkstationIsNotAStepError} le poste finit la ligne : son rouge est « Problème ».
 * @throws {WorkstationNotOnLineError} le poste n'est pas un poste du produit.
 * @throws {InvalidStepReasonError} la raison est trop longue.
 */
@CommandHandler(MarkStepRedCommand)
export class MarkStepRedHandler implements ICommandHandler<MarkStepRedCommand, void> {
  constructor(
    private readonly gestures: LineStepGestures,
    private readonly authors: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: MarkStepRedCommand): Promise<void> {
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
        gesture: "production.line.step_red",
        subject: intentSubject(`${key.serviceDay}:${key.sku}:${key.workstationId}`, command.reason),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const mark = { at: this.clock.now(), staffId: command.staffUserId, name };
          await this.gestures.apply(key, (known) =>
            known === null
              ? LineStep.checkRed(key, command.reason, mark)
              : known.markRed(command.reason, mark)
                ? known
                : null,
          );
          await seal(undefined);
        }),
    );
  }
}
