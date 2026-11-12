import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PricedPeriodIsSealedError } from "../../domain/pricing-errors.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { VolumeLadderAggregate } from "../../domain/entities/volume-ladder.js";
import { VolumeLadderRepository } from "../../domain/ports/volume-ladder.repository.js";
import { describeLadder } from "../../domain/pricing-act.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { clienteleOfAudience, saleReferenceOf } from "../../domain/services/sale-references.js";
import { assertOnSale } from "./sale-reference-support.js";
import { SetVolumeLadderCommand } from "./set-volume-ladder.command.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import type { PricingAct } from "../../domain/pricing-act.js";

/** Le nom stable du geste, dans le registre des intentions. */
const SET_LADDER_GESTURE = "pricing.set-volume-ladder";

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
    private readonly references: SaleReferenceReader,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est réclamée avant tout et
   * scellée dans la transaction de l'écriture ; un double clic rend ce qui a
   * déjà été posé, sans rien poser une seconde fois. Le sujet est l'empreinte
   * de la saisie : la même clé sur une autre saisie est refusée (409).
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour une autre saisie.
   */
  execute(command: SetVolumeLadderCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: SET_LADDER_GESTURE,
        subject: intentSubject("volume-ladder", command.draft),
      },
      CREATED_ID_REPLAY,
      (seal) => this.set(command, seal),
    );
  }

  private async set(
    command: SetVolumeLadderCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    const ladder = VolumeLadderAggregate.pose(this.ids.next(), command.draft, command.staffUserId);
    // Un barème sur une référence hors vente ne mordrait jamais (L5).
    await assertOnSale(
      this.references,
      [saleReferenceOf(command.draft.scope)],
      clienteleOfAudience(command.draft.audience),
    );
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

    const act: PricingAct = {
      subjectType: "ladder",
      subjectId: ladder.id,
      kind: "posed",
      actor: command.staffUserId,
      at: this.clock.now(),
      reason: null,
      summary: describeLadder(ladder.asLadder),
      subjectLabel: ladder.asLadder.label,
    };
    await this.uow.run(async () => {
      await this.ladders.pose(ladder, act);
      await seal(ladder.id);
    });
    return ladder.id;
  }
}
