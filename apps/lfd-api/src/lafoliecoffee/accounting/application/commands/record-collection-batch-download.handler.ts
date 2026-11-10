import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionBatchDownloadedEvent } from "../../domain/events/collection.events.js";
import { CollectionBatchLock } from "../../domain/ports/collection-batch-lock.js";
import { CollectionBatchRepository } from "../../domain/ports/collection-batch.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { batchEntity, loadBatchOrFail } from "../collection-batch-support.js";
import { RecordCollectionBatchDownloadCommand } from "./record-collection-batch-download.command.js";

/**
 * **Le téléchargement du fichier de remise** : le lot garde l'instant (ce qui
 * ouvre « J'ai déposé »), le journal garde chaque téléchargement — qui,
 * quand, quel lot ; jamais un IBAN.
 *
 * Sous le verrou du lot (revue du 2026-10-23) : téléchargé pendant une
 * annulation, il attend et écrit l'instant sur le lot annulé — le fichier
 * d'un lot annulé se retélécharge (préfixe `ANNULE-`) — au lieu d'échouer sur
 * l'écriture conditionnelle du lot.
 */
@CommandHandler(RecordCollectionBatchDownloadCommand)
export class RecordCollectionBatchDownloadHandler implements ICommandHandler<
  RecordCollectionBatchDownloadCommand,
  void
> {
  constructor(
    private readonly lock: CollectionBatchLock,
    private readonly batches: CollectionBatchRepository,
    private readonly entities: LegalEntityReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RecordCollectionBatchDownloadCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.lock.lock(command.batchId);
      const batch = await loadBatchOrFail(this.batches, command.batchId);
      batch.recordDownload(at);
      await this.batches.save(batch);
      const entity = await batchEntity(this.entities, batch);
      await this.events.publishTraced(new CollectionBatchDownloadedEvent(batch, entity, at));
    });
  }
}
