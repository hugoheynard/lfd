import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { WorkstationTrackingLevelSetEvent } from "../../domain/events/workstation.events.js";
import { WorkstationMapGesture } from "../services/workstation-map-gesture.service.js";
import { changedStation } from "../workstation-support.js";
import { SetWorkstationTrackingLevelCommand } from "./set-workstation-tracking-level.command.js";

/**
 * Règle le niveau de suivi propre d'un poste (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.1). **Une fois par
 * intention** : rejouer ce réglage après celui de quelqu'un d'autre ne le
 * défait pas. Le même niveau, reposé, n'écrit ni ne journalise rien.
 *
 * Le geste réécrit le poste à l'instant du `Clock` : le numéro de la carte
 * (`WorkstationMapVersion`) monte, et la fiche gardée se relit. Il vaut à
 * partir de la prochaine journée arrêtée : une journée lit son niveau figé.
 *
 * @throws {WorkstationNotFoundError} @throws {WorkstationArchivedError}
 */
@CommandHandler(SetWorkstationTrackingLevelCommand)
export class SetWorkstationTrackingLevelHandler implements ICommandHandler<
  SetWorkstationTrackingLevelCommand,
  void
> {
  constructor(
    private readonly gesture: WorkstationMapGesture,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: SetWorkstationTrackingLevelCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.workstation.tracking_level",
        subject: intentSubject(command.workstationId, command.trackingLevel),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.gesture.apply(
          command.staffUserId,
          (map) => {
            const previous = map.active().find((station) => station.id === command.workstationId);
            map.setTrackingLevel(command.workstationId, command.trackingLevel);
            if (map.changes().workstations.length === 0 || previous === undefined) {
              return { result: undefined, events: [] };
            }
            const set = changedStation(map, command.workstationId);
            return {
              result: undefined,
              events: [new WorkstationTrackingLevelSetEvent(set, previous.trackingLevel)],
            };
          },
          seal,
        ),
    );
  }
}
