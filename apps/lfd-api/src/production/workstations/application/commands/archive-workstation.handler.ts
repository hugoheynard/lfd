import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { Clock } from "../../../../platform/time/clock.js";
import { WorkstationArchivedEvent } from "../../domain/events/workstation.events.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { changedStation } from "../workstation-support.js";
import { ArchiveWorkstationCommand } from "./archive-workstation.command.js";

/**
 * Archive un poste — il ne s'efface pas. **Une fois par intention** : le
 * rejeu d'un archivage abouti rend son issue sans réécrire.
 *
 * @throws {WorkstationNotFoundError} @throws {WorkstationArchivedError}
 * @throws {WorkstationStillUsedError} il porte encore des produits.
 */
@CommandHandler(ArchiveWorkstationCommand)
export class ArchiveWorkstationHandler implements ICommandHandler<ArchiveWorkstationCommand, void> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
    private readonly clock: Clock,
  ) {}

  execute(command: ArchiveWorkstationCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.archive",
        subject: intentSubject(command.workstationId),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.gesture.apply(
          command.staffUserId,
          (map) => {
            map.archive(command.workstationId, this.clock.now());
            const archived = changedStation(map, command.workstationId);
            return { result: undefined, events: [new WorkstationArchivedEvent(archived)] };
          },
          seal,
        ),
    );
  }
}
