import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BatchAttestationRecordedEvent } from "../../domain/events/collection-batch-attestation.events.js";
import { CollectionBatchAttestationRepository } from "../../domain/ports/collection-batch-attestation.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { attestationsOrFail } from "../collection-batch-attestation-support.js";
import { AttestCollectionBatchCommand } from "./attest-collection-batch.command.js";

/**
 * **Attester un geste sur un lot** (P3) : une ligne de plus au registre, et
 * son fait. L'agrégat refuse ce qui l'est déjà et ce qui n'est pas dans
 * l'ordre de la procédure. Ne conditionne AUCUN geste : l'onglet 3 seul le lit.
 */
@CommandHandler(AttestCollectionBatchCommand)
export class AttestCollectionBatchHandler implements ICommandHandler<
  AttestCollectionBatchCommand,
  string
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly attestations: CollectionBatchAttestationRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AttestCollectionBatchCommand): Promise<string> {
    const at = this.clock.now();
    return this.uow.run(async () => {
      const { attestations, entity } = await attestationsOrFail(
        { attestations: this.attestations, entities: this.entities },
        command.batchId,
      );
      const stamp = { at, staffId: command.staffUserId };
      const entry = attestations.attest(command.kind, this.ids.next(), stamp);
      await this.attestations.save(attestations);
      await this.events.publishTraced(
        new BatchAttestationRecordedEvent(entry, attestations.batch, entity),
      );
      return entry.id;
    });
  }
}
