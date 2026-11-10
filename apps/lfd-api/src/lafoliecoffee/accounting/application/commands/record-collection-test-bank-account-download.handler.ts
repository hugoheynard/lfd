import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionTestBankAccountExportedEvent } from "../../domain/events/collection-test.events.js";
import { RecordCollectionTestBankAccountDownloadCommand } from "./record-collection-test-bank-account-download.command.js";

/**
 * **Le téléchargement du RIB d'essai au journal** : qui, quand, quelle
 * société, sous quelle entité — jamais un IBAN. Aucun agrégat ne change :
 * l'essai ne marque rien, seule la trace de la sortie du fichier reste.
 */
@CommandHandler(RecordCollectionTestBankAccountDownloadCommand)
export class RecordCollectionTestBankAccountDownloadHandler implements ICommandHandler<
  RecordCollectionTestBankAccountDownloadCommand,
  void
> {
  constructor(
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: RecordCollectionTestBankAccountDownloadCommand): Promise<void> {
    await this.events.publishTraced(
      new CollectionTestBankAccountExportedEvent(
        command.company,
        command.legalEntity,
        this.clock.now(),
      ),
    );
  }
}
