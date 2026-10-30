import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ArticleSaleUnits } from "../../../catalog/application/article-sale-units.service.js";
import {
  ensureNotYetCarried,
  type DecisionCarry,
} from "../../domain/entities/decision-carry-over.js";
import { VolumeCommitmentAggregate } from "../../domain/entities/volume-commitment.js";
import { CarriedDecisionNotFoundError } from "../../domain/pricing-errors.js";
import { CarriedDecisionsReader } from "../../domain/ports/carried-decisions.reader.js";
import { CarryOverLock } from "../../domain/ports/carry-over.lock.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { ReservedElsewhereReader } from "../../domain/ports/reserved-elsewhere.reader.js";
import { SaleReferenceLineageReader } from "../../domain/ports/sale-reference-lineage.reader.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { VolumeCommitmentRepository } from "../../domain/ports/volume-commitment.repository.js";
import { VolumeCommitmentSignedEvent } from "../../domain/volume-commitment.events.js";
import { CarryOverVolumeCommitmentCommand } from "./carry-over-volume-commitment.command.js";
import { assertDetachedFrom } from "./decision-carry-over-support.js";
import { assertNotReservedElsewhere, assertOnSale } from "./sale-reference-support.js";

/**
 * **Reporter un engagement de volume** sur la référence née d'un
 * détachement (`plan-report-apres-detachement.md`, § 2.1, R4) : la MÊME
 * promesse, même société, signée sur la nouvelle référence. L'ancien court
 * jusqu'à sa fin (§ 7 bis) — rien n'est clos.
 *
 * La signature se journalise comme une signature (`volume_commitment.signed`) :
 * c'est un engagement de plus, que le client a déjà pris.
 */
@CommandHandler(CarryOverVolumeCommitmentCommand)
export class CarryOverVolumeCommitmentHandler implements ICommandHandler<
  CarryOverVolumeCommitmentCommand,
  string
> {
  constructor(
    private readonly commitments: VolumeCommitmentRepository,
    private readonly lineage: SaleReferenceLineageReader,
    private readonly references: SaleReferenceReader,
    private readonly reservations: ReservedElsewhereReader,
    private readonly carried: CarriedDecisionsReader,
    private readonly lock: CarryOverLock,
    private readonly saleUnits: ArticleSaleUnits,
    private readonly companies: PricedCompanyNamer,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Rend l'identifiant de l'engagement signé.
   *
   * @throws {NotDetachedFromError} la nouvelle référence n'est pas née de l'ancienne.
   * @throws {SaleReferenceNotOnSaleError} la nouvelle ne se vend pas aux pros.
   * @throws {WeightArticleCommitmentError} la nouvelle se vend au poids.
   * @throws {CarriedDecisionNotFoundError} aucun engagement de cet identifiant.
   * @throws {ReservedArticleRefusedError} l'article est réservé à une autre société.
   * @throws {DecisionAlreadyCarriedError} déjà reporté pour cette société.
   * @throws les refus de `VolumeCommitmentAggregate.carriedFrom`, et `OverlappingVolumeCommitmentError`.
   */
  async execute(command: CarryOverVolumeCommitmentCommand): Promise<string> {
    const carry: DecisionCarry = { fromSku: command.fromSku, toSku: command.toSku };
    await assertDetachedFrom(this.lineage, carry);
    await assertOnSale(this.references, [carry.toSku], "pro");
    // Un article au poids ne se compte pas en volume promis (`vente-au-poids.md`, P3).
    VolumeCommitmentAggregate.ensureCountedInPieces(
      { type: "variant", id: carry.toSku },
      await this.saleUnits.weightSoldAmong([carry.toSku]),
    );
    const now = this.clock.now();
    const id = this.ids.next();
    await this.uow.run(async () => {
      await this.lock.acquire("volume_commitment", carry.toSku);
      const source = await this.commitments.load(command.commitmentId);
      if (source === null) {
        throw new CarriedDecisionNotFoundError("volume_commitment", command.commitmentId);
      }
      const commitment = VolumeCommitmentAggregate.carriedFrom(
        id,
        source,
        carry,
        command.staffUserId,
        now,
      );
      await assertNotReservedElsewhere(this.reservations, commitment.companyId, [carry.toSku]);
      ensureNotYetCarried(
        "volume_commitment",
        carry,
        commitment.companyId,
        await this.carried.carriedAudiences("volume_commitment", carry.fromSku, carry.toSku, now),
      );
      await this.commitments.sign(commitment);
      const companyName = await this.companies.nameOf(commitment.companyId);
      await this.events.publishTraced(new VolumeCommitmentSignedEvent(commitment, companyName));
    });
    return id;
  }
}
