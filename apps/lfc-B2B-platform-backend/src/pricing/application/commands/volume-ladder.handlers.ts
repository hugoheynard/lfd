import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../infra/time/clock.js";
import { IdGenerator } from "../../../infra/id/id-generator.js";
import { VolumeLadderAggregate } from "../../domain/entities/volume-ladder.js";
import { VolumeLadderRepository } from "../../domain/ports/volume-ladder.repository.js";
import { describeLadder } from "../../domain/pricing-act.js";
import { SetVolumeLadderCommand } from "./pricing.commands.js";

/**
 * **Poser un barème de volume.**
 *
 * Aucun refus ici : ils vivent dans l'agrégat — un barème qui régresse, deux
 * paliers à la même quantité, une échelle vide — et dans la contrainte
 * d'exclusion, qui interdit deux barèmes actifs sur la même cible. Le handler
 * fabrique, journalise, et rend au port.
 */
@CommandHandler(SetVolumeLadderCommand)
export class SetVolumeLadderHandler implements ICommandHandler<SetVolumeLadderCommand, string> {
  constructor(
    private readonly ladders: VolumeLadderRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /** Rend l'identifiant posé : l'écran en a besoin pour cibler ses gestes. */
  async execute(command: SetVolumeLadderCommand): Promise<string> {
    const ladder = VolumeLadderAggregate.pose(this.ids.next(), command.draft, command.staffSub);
    await this.ladders.pose(ladder, {
      subjectType: "ladder",
      subjectId: ladder.id,
      kind: "posed",
      actor: command.staffSub,
      at: this.clock.now(),
      reason: null,
      summary: describeLadder(ladder.asLadder),
    });
    return ladder.id;
  }
}
