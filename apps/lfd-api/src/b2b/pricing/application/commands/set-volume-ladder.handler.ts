import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PricedPeriodIsSealedError } from "../../domain/pricing-errors.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { VolumeLadderAggregate } from "../../domain/entities/volume-ladder.js";
import { VolumeLadderRepository } from "../../domain/ports/volume-ladder.repository.js";
import { describeLadder } from "../../domain/pricing-act.js";
import { SetVolumeLadderCommand } from "./set-volume-ladder.command.js";

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
    private readonly priced: PricedDecisionsReader,
  ) {}

  /** Rend l'identifiant posé : l'écran en a besoin pour cibler ses gestes. */
  async execute(command: SetVolumeLadderCommand): Promise<string> {
    const ladder = VolumeLadderAggregate.pose(this.ids.next(), command.draft, command.staffUserId);
    // 🔴 **Le recouvrement que la base ne voit pas.** La contrainte d'exclusion
    // est PARTIELLE (`WHERE archived_at IS NULL`) : elle refuse le chevauchement
    // avec un barème en cours, jamais avec un rangé. Depuis que clore borne
    // la fenêtre (R17), un barème rangé garde sa place dans le passé, et poser
    // par-dessus donnerait deux décisions à la même date.
    //
    // ⚠️ Le refus vise « **a facturé** », pas « est passé ». Un barème posé
    // puis rangé dix minutes plus tard n'a rien facturé : le reposer est le
    // geste ordinaire « je me suis trompé, je recommence ».
    const sealed = await this.ladders.archivedOverlapping(ladder);
    if (sealed.length > 0 && (await this.priced.anyPriced(sealed))) {
      throw new PricedPeriodIsSealedError("barème", ladder.toPersistence().validFrom);
    }

    await this.ladders.pose(ladder, {
      subjectType: "ladder",
      subjectId: ladder.id,
      kind: "posed",
      actor: command.staffUserId,
      at: this.clock.now(),
      reason: null,
      summary: describeLadder(ladder.asLadder),
      subjectLabel: ladder.asLadder.label,
    });
    return ladder.id;
  }
}
