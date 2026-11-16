import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { WorkstationDeclaredEvent } from "../../domain/events/workstation.events.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { changedStation } from "../workstation-support.js";
import { DeclareWorkstationCommand } from "./declare-workstation.command.js";

/**
 * Ajoute un poste au fournil, en dernier. **Une fois par intention** : un
 * double clic n'en crée qu'un, et le rejeu rend le même identifiant.
 *
 * @throws {InvalidWorkstationNameError} @throws {WorkstationNameTakenError}
 */
@CommandHandler(DeclareWorkstationCommand)
export class DeclareWorkstationHandler implements ICommandHandler<
  DeclareWorkstationCommand,
  string
> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
    private readonly ids: IdGenerator,
  ) {}

  execute(command: DeclareWorkstationCommand): Promise<string> {
    const id = this.ids.next();
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.declare",
        subject: intentSubject("workstations", command.name),
      },
      CREATED_ID_REPLAY,
      (seal) =>
        this.gesture.apply(
          command.staffUserId,
          (map) => {
            map.declare(id, command.name);
            return { result: id, events: [new WorkstationDeclaredEvent(changedStation(map, id))] };
          },
          seal,
        ),
    );
  }
}
