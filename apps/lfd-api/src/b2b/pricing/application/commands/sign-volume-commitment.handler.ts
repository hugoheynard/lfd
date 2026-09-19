import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PricedPeriodIsSealedError } from "../../domain/pricing-errors.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { VolumeCommitmentSignedEvent } from "../../domain/volume-commitment.events.js";
import { VolumeCommitmentAggregate } from "../../domain/entities/volume-commitment.js";
import { VolumeCommitmentRepository } from "../../domain/ports/volume-commitment.repository.js";
import { SignVolumeCommitmentCommand } from "./sign-volume-commitment.command.js";

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
  ) {}

  async execute(command: SignVolumeCommitmentCommand): Promise<string> {
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
    // 🔴 **Le recouvrement que la base ne voit pas.** La contrainte d'exclusion
    // est PARTIELLE (`WHERE archived_at IS NULL`) : elle refuse le chevauchement
    // avec un engagement en cours, jamais avec un rangé. Depuis que clore borne
    // la fenêtre (R17), un engagement rangé garde sa place dans le passé, et poser
    // par-dessus donnerait deux décisions à la même date.
    //
    // ⚠️ Le refus vise « **a facturé** », pas « est passé ». Un engagement posé
    // puis rangé dix minutes plus tard n'a rien facturé : le reposer est le
    // geste ordinaire « je me suis trompé, je recommence ».
    const sealed = await this.commitments.archivedOverlapping(commitment);
    if (sealed.length > 0 && (await this.priced.anyPriced(sealed))) {
      throw new PricedPeriodIsSealedError("engagement", commitment.toPersistence().validFrom);
    }

    await this.uow.run(async () => {
      await this.commitments.sign(commitment);
      await this.events.publishTraced(new VolumeCommitmentSignedEvent(commitment));
    });
    return commitment.id;
  }
}
