import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { WorkstationRenamedEvent } from "../../domain/events/workstation.events.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { changedStation } from "../workstation-support.js";
import { RenameWorkstationCommand } from "./rename-workstation.command.js";

/**
 * Renomme un poste en service. **Une fois par intention** : rejouer ce
 * renommage après celui de quelqu'un d'autre ne le défait pas. Le même nom,
 * reposé, n'écrit ni ne journalise rien.
 *
 * @throws {InvalidWorkstationNameError} @throws {WorkstationNameTakenError}
 * @throws {WorkstationNotFoundError} @throws {WorkstationArchivedError}
 */
@CommandHandler(RenameWorkstationCommand)
export class RenameWorkstationHandler implements ICommandHandler<RenameWorkstationCommand, void> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: RenameWorkstationCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.rename",
        subject: intentSubject(command.workstationId, command.name),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.gesture.apply(
          command.staffUserId,
          (map) => {
            const previous = map.active().find((station) => station.id === command.workstationId);
            map.rename(command.workstationId, command.name);
            // Le même nom ne change rien à la carte : rien à écrire, rien à journaliser.
            if (map.changes().workstations.length === 0 || previous === undefined) {
              return { result: undefined, events: [] };
            }
            const renamed = changedStation(map, command.workstationId);
            return {
              result: undefined,
              events: [new WorkstationRenamedEvent(renamed, previous.name)],
            };
          },
          seal,
        ),
    );
  }
}
