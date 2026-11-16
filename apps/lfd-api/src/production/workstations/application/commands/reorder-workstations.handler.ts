import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { WorkstationsReorderedEvent } from "../../domain/events/workstation.events.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { ReorderWorkstationsCommand } from "./reorder-workstations.command.js";

/**
 * Pose l'ordre des fiches de poste. **Une fois par intention**. Le même
 * ordre, reposé, n'écrit ni ne journalise rien.
 *
 * @throws {WorkstationOrderMismatchError} l'ordre ne nomme pas exactement les postes en service.
 */
@CommandHandler(ReorderWorkstationsCommand)
export class ReorderWorkstationsHandler implements ICommandHandler<
  ReorderWorkstationsCommand,
  void
> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ReorderWorkstationsCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.reorder",
        subject: intentSubject("workstations", command.workstationIds),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.gesture.apply(
          command.staffUserId,
          (map) => {
            map.reorder(command.workstationIds);
            const moved = map.changes().workstations.length > 0;
            return {
              result: undefined,
              events: moved ? [new WorkstationsReorderedEvent(map.active())] : [],
            };
          },
          seal,
        ),
    );
  }
}
