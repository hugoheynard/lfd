import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../infra/time/clock.js";
import { IdGenerator } from "../../../infra/id/id-generator.js";
import { VolumeLadderAggregate } from "../../domain/entities/volume-ladder.js";
import { VolumeLadderRepository } from "../../domain/ports/volume-ladder.repository.js";
import { describeLadder } from "../../domain/pricing-act.js";
import { VolumeLadderNotFoundError } from "../../domain/pricing-errors.js";
import {
  ArchiveVolumeLadderCommand,
  PauseVolumeLadderCommand,
  ResumeVolumeLadderCommand,
  SetVolumeLadderCommand,
} from "./pricing.commands.js";
import type { PricingAct, PricingActKind } from "../../domain/pricing-act.js";

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

/**
 * **Les trois gestes qui arrêtent, reprennent et rangent un barème.**
 *
 * Le port les déclarait (`update`) depuis la persistance des barèmes, et
 * l'agrégat ne savait rien en faire : ni méthode, ni route, ni bouton. Un
 * barème ne pouvait donc que naître — et rester. La seule façon d'en corriger un
 * était d'en poser un autre, que la contrainte d'exclusion refusait.
 *
 * Aucun refus ici : ils vivent dans l'agrégat, comme pour les règles.
 */

@CommandHandler(PauseVolumeLadderCommand)
export class PauseVolumeLadderHandler implements ICommandHandler<PauseVolumeLadderCommand, void> {
  constructor(
    private readonly ladders: VolumeLadderRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: PauseVolumeLadderCommand): Promise<void> {
    const now = this.clock.now();
    const ladder = await mustLoadLadder(this.ladders, command.id);
    await this.ladders.update(
      ladder.pause(command.staffSub, now),
      ladderAct(ladder, "paused", command.staffSub, now, command.reason),
    );
  }
}

@CommandHandler(ResumeVolumeLadderCommand)
export class ResumeVolumeLadderHandler implements ICommandHandler<ResumeVolumeLadderCommand, void> {
  constructor(
    private readonly ladders: VolumeLadderRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ResumeVolumeLadderCommand): Promise<void> {
    const now = this.clock.now();
    const ladder = await mustLoadLadder(this.ladders, command.id);
    await this.ladders.update(
      ladder.resume(),
      ladderAct(ladder, "resumed", command.staffSub, now, null),
    );
  }
}

@CommandHandler(ArchiveVolumeLadderCommand)
export class ArchiveVolumeLadderHandler implements ICommandHandler<
  ArchiveVolumeLadderCommand,
  void
> {
  constructor(
    private readonly ladders: VolumeLadderRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveVolumeLadderCommand): Promise<void> {
    const now = this.clock.now();
    const ladder = await mustLoadLadder(this.ladders, command.id);
    await this.ladders.update(
      ladder.archive(command.staffSub, now, command.reason),
      ladderAct(ladder, "archived", command.staffSub, now, command.reason),
    );
  }
}

/** @throws {VolumeLadderNotFoundError} aucun barème sous cet identifiant. */
async function mustLoadLadder(
  ladders: VolumeLadderRepository,
  id: string,
): Promise<VolumeLadderAggregate> {
  const ladder = await ladders.load(id);
  if (ladder === null) {
    throw new VolumeLadderNotFoundError(id);
  }
  return ladder;
}

/**
 * L'acte décrit le barème **tel qu'il était AVANT** le geste.
 *
 * C'est ce qui rend le journal lisible six mois plus tard : « suspendu — barème
 * de volume, 3 paliers » dit ce qu'on a arrêté. Décrire l'état d'après aurait
 * raconté le résultat, pas la décision.
 */
function ladderAct(
  ladder: VolumeLadderAggregate,
  kind: PricingActKind,
  actor: string,
  at: Date,
  reason: string | null,
): PricingAct {
  return {
    subjectType: "ladder",
    subjectId: ladder.id,
    kind,
    actor,
    at,
    reason,
    summary: describeLadder(ladder.asLadder),
  };
}
