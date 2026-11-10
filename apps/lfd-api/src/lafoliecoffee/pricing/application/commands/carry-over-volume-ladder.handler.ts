import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  audienceKey,
  ensureNotYetCarried,
  type DecisionCarry,
} from "../../domain/entities/decision-carry-over.js";
import { VolumeLadderAggregate } from "../../domain/entities/volume-ladder.js";
import { describeLadder } from "../../domain/pricing-act.js";
import { CarriedDecisionNotFoundError } from "../../domain/pricing-errors.js";
import { CarriedDecisionsReader } from "../../domain/ports/carried-decisions.reader.js";
import { CarryOverLock } from "../../domain/ports/carry-over.lock.js";
import { VolumeLadderRepository } from "../../domain/ports/volume-ladder.repository.js";
import { ReservedElsewhereReader } from "../../domain/ports/reserved-elsewhere.reader.js";
import { SaleReferenceLineageReader } from "../../domain/ports/sale-reference-lineage.reader.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { clienteleOfAudience } from "../../domain/services/sale-references.js";
import { CarryOverVolumeLadderCommand } from "./carry-over-volume-ladder.command.js";
import { assertDetachedFrom } from "./decision-carry-over-support.js";
import { assertNotReservedElsewhere, assertOnSale } from "./sale-reference-support.js";

/**
 * **Reporter un barème de volume** sur la référence née d'un détachement
 * (`plan-report-apres-detachement.md`, R3) : poser un barème NEUF, mêmes
 * paliers, par le chemin de la pose — agrégat, contrainte d'exclusion, L5,
 * journal —, jamais réécrire l'ancien.
 *
 * Verrou, relecture de l'ancienne, « déjà reportée » et écriture dans la MÊME
 * unité de travail : deux reports simultanés ne passent pas tous les deux.
 */
@CommandHandler(CarryOverVolumeLadderCommand)
export class CarryOverVolumeLadderHandler implements ICommandHandler<
  CarryOverVolumeLadderCommand,
  string
> {
  constructor(
    private readonly ladders: VolumeLadderRepository,
    private readonly lineage: SaleReferenceLineageReader,
    private readonly references: SaleReferenceReader,
    private readonly reservations: ReservedElsewhereReader,
    private readonly carried: CarriedDecisionsReader,
    private readonly lock: CarryOverLock,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Rend l'identifiant du barème posé.
   *
   * @throws {NotDetachedFromError} la nouvelle référence n'est pas née de l'ancienne.
   * @throws {CarriedDecisionNotFoundError} aucun barème de cet identifiant.
   * @throws {SaleReferenceNotOnSaleError} la nouvelle ne se vend pas à l'audience du barème.
   * @throws {ReservedArticleRefusedError} barème d'une société, article réservé à une autre.
   * @throws {DecisionAlreadyCarriedError} déjà reporté pour la même audience.
   * @throws les refus de `VolumeLadderAggregate.carriedFrom`, et `OverlappingVolumeLadderError`.
   */
  async execute(command: CarryOverVolumeLadderCommand): Promise<string> {
    const carry: DecisionCarry = { fromSku: command.fromSku, toSku: command.toSku };
    await assertDetachedFrom(this.lineage, carry);
    const now = this.clock.now();
    const id = this.ids.next();
    await this.uow.run(async () => {
      await this.lock.acquire("volume_ladder", carry.toSku);
      const source = await this.ladders.load(command.ladderId);
      if (source === null) {
        throw new CarriedDecisionNotFoundError("volume_ladder", command.ladderId);
      }
      const ladder = VolumeLadderAggregate.carriedFrom(id, source, carry, command.staffUserId, now);
      await this.guard(ladder, carry, now);
      await this.ladders.pose(ladder, {
        subjectType: "ladder",
        subjectId: ladder.id,
        kind: "posed",
        actor: command.staffUserId,
        at: now,
        reason: command.reason.trim(),
        summary: describeLadder(ladder.asLadder),
        subjectLabel: ladder.label,
      });
    });
    return id;
  }

  /** Ce que la nouvelle référence doit accepter : la vente (L5), la réservation, l'unicité du report. */
  private async guard(
    ladder: VolumeLadderAggregate,
    carry: DecisionCarry,
    now: Date,
  ): Promise<void> {
    const { audience } = ladder.asLadder;
    await assertOnSale(this.references, [carry.toSku], clienteleOfAudience(audience));
    if (audience.type === "company" && audience.id !== null) {
      await assertNotReservedElsewhere(this.reservations, audience.id, [carry.toSku]);
    }
    ensureNotYetCarried(
      "volume_ladder",
      carry,
      audienceKey(audience),
      await this.carried.carriedAudiences("volume_ladder", carry.fromSku, carry.toSku, now),
    );
  }
}
