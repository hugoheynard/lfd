import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailRecipientSearchedEvent } from "../../domain/mail-sends.events.js";
import { MailSendFinder } from "../../domain/ports/mail-send-finder.js";
import { RecipientFingerprint } from "../../domain/ports/recipient-fingerprint.js";
import { StaffMailConsultationsRepository } from "../../domain/ports/staff-mail-consultations.repository.js";
import { mailSearchKeyOf } from "../../domain/services/mail-search-address.js";
import { SearchMailByRecipientCommand } from "./search-mail-by-recipient.command.js";

/**
 * Cherche les envois d'une adresse normalisée (`recipient_key`), puis range
 * la recherche — son EMPREINTE, jamais l'adresse — avec les identifiants
 * trouvés, et publie `mail.recipient_searched`, dans une même transaction.
 *
 * 🔴 **Le résultat est figé à l'instant de la recherche**, et c'est voulu :
 * l'adresse n'est pas gardée, la lecture ne peut donc pas chercher de
 * nouveau. Un envoi parti dans les 5 minutes qui suivent n'y paraît pas ;
 * un envoi purgé depuis en disparaît.
 */
@CommandHandler(SearchMailByRecipientCommand)
export class SearchMailByRecipientHandler implements ICommandHandler<
  SearchMailByRecipientCommand,
  string
> {
  constructor(
    private readonly finder: MailSendFinder,
    private readonly fingerprints: RecipientFingerprint,
    private readonly consultations: StaffMailConsultationsRepository,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @returns l'identifiant de la recherche.
   * @throws {InvalidMailSearchAddressError} l'adresse n'en a pas la forme.
   * @throws {MailConsultationLimitReachedError} 30 consultations dans l'heure.
   */
  async execute({ address, staffUserId }: SearchMailByRecipientCommand): Promise<string> {
    const key = mailSearchKeyOf(address);
    const fingerprint = this.fingerprints.of(key);
    const now = this.clock.now();
    const id = this.ids.next();
    await this.uow.run(async () => {
      const consultations = await this.consultations.load(staffUserId, now);
      const found = await this.finder.idsByRecipientKey(key);
      consultations.search(id, fingerprint, found, now);
      await this.consultations.save(consultations);
      await this.events.publishTraced(new MailRecipientSearchedEvent(id, found.length));
    });
    return id;
  }
}
