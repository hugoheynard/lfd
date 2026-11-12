import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PricedPeriodIsSealedError } from "../../domain/pricing-errors.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { VolumeCommitmentSignedEvent } from "../../domain/volume-commitment.events.js";
import { VolumeCommitmentAggregate } from "../../domain/entities/volume-commitment.js";
import { VolumeCommitmentRepository } from "../../domain/ports/volume-commitment.repository.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { saleReferenceOf } from "../../domain/services/sale-references.js";
import { assertOnSale } from "./sale-reference-support.js";
import { SignVolumeCommitmentCommand } from "./sign-volume-commitment.command.js";
import { ArticleSaleUnits } from "../../../catalog/application/article-sale-units.service.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";

/** Le nom stable du geste, dans le registre des intentions. */
const SIGN_GESTURE = "pricing.sign-volume-commitment";

@CommandHandler(SignVolumeCommitmentCommand)
export class SignVolumeCommitmentHandler implements ICommandHandler<
  SignVolumeCommitmentCommand,
  string
> {
  constructor(
    private readonly commitments: VolumeCommitmentRepository,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly priced: PricedDecisionsReader,
    private readonly companies: PricedCompanyNamer,
    private readonly saleUnits: ArticleSaleUnits,
    private readonly references: SaleReferenceReader,
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
  execute(command: SignVolumeCommitmentCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: SIGN_GESTURE,
        subject: intentSubject(command.payload.companyId, command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.sign(command, seal),
    );
  }

  private async sign(
    command: SignVolumeCommitmentCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    const { payload } = command;
    const commitment = VolumeCommitmentAggregate.sign(
      this.ids.next(),
      {
        companyId: payload.companyId,
        scope: payload.scope,
        promisedQuantity: payload.promisedQuantity,
        validFrom: new Date(payload.validFrom),
        validTo: new Date(payload.validTo),
      },
      command.staffUserId,
    );
    // Un engagement sur une référence hors vente ne se cumulerait jamais (L5).
    await assertOnSale(this.references, [saleReferenceOf(payload.scope)], "pro");
    // 🔴 **Le recouvrement que la base ne voit pas.** La contrainte d'exclusion
    // est PARTIELLE (`WHERE archived_at IS NULL`) : elle refuse le chevauchement
    // avec un engagement en cours, jamais avec un rangé. Depuis que clore borne
    // la fenêtre (R17), un engagement rangé garde sa place dans le passé, et poser
    // par-dessus donnerait deux décisions à la même date.
    //
    // ⚠️ Le refus vise « **a facturé** », pas « est passé ». Un engagement posé
    // puis rangé dix minutes plus tard n'a rien facturé : le reposer est le
    // geste ordinaire « je me suis trompé, je recommence ».
    // Un article au poids ne se compte pas en volume promis (`vente-au-poids.md`, P3).
    VolumeCommitmentAggregate.ensureCountedInPieces(
      payload.scope,
      await this.saleUnits.weightSoldAmong(payload.scope.id === null ? [] : [payload.scope.id]),
    );
    const sealed = await this.commitments.archivedOverlapping(commitment);
    if (sealed.length > 0 && (await this.priced.anyPriced(sealed))) {
      throw new PricedPeriodIsSealedError("engagement", commitment.toPersistence().validFrom);
    }

    const companyName = await this.companies.nameOf(payload.companyId);
    await this.uow.run(async () => {
      await this.commitments.sign(commitment);
      await this.events.publishTraced(new VolumeCommitmentSignedEvent(commitment, companyName));
      await seal(commitment.id);
    });
    return commitment.id;
  }
}
