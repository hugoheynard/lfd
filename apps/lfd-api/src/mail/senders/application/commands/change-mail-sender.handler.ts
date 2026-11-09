import type { MailNature, MailSpace } from "@lfd/mail-blocks";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffContacts } from "../../../../staff/directory/domain/staff-contacts.js";
import { TrialRecipientMissingError } from "../../../copy/domain/mail-copy-errors.js";
import { MailCopyReleaseRepository } from "../../../copy/domain/ports/mail-copy-release.repository.js";
import { PublishedMailCopyCache } from "../../../copy/domain/ports/published-mail-copy.cache.js";
import { mailSpaceOfParam } from "../../../charters/application/mail-space-param.js";
import { MailSenderChangedEvent } from "../../domain/mail-sender.events.js";
import { assertSendable, type MailSenderStamp } from "../../domain/mail-space-sender.js";
import { MailSenderTrial } from "../../domain/ports/mail-sender-trial.js";
import { MailSpaceSenderRepository } from "../../domain/ports/mail-space-sender.repository.js";
import { VerifiedSendingDomains } from "../../domain/ports/verified-sending-domains.js";
import { mailNatureOfParam } from "../mail-nature-param.js";
import { ChangeMailSenderCommand } from "./change-mail-sender.command.js";

/**
 * **Change l'identité d'envoi d'un espace** (plan `plan-editeur-par-blocs.md`,
 * § 25, C3), dans cet ordre :
 *
 * 1. la révision et la forme, sans réseau ;
 * 2. les domaines vérifiés, lus chez Resend HORS transaction — un domaine
 *    absent refuse nommément ;
 * 3. **l'essai**, envoyé tout de suite à l'adresse de la fiche de l'auteur
 *    (jamais une adresse de la requête) sous l'identité proposée — refusé par
 *    Resend, rien n'est enregistré ;
 * 4. la transaction relit, change (mêmes règles), fait monter la version des
 *    textes des e-mails — l'estampille du cache de l'envoi : sans elle, les
 *    autres instances garderaient l'ancienne identité — et journalise.
 *
 * Le cache de CETTE instance est oublié après la validation. Un essai parti
 * pour un enregistrement qui échoue ensuite (révision dépassée entre-temps)
 * reste parti : c'est le sens sans dommage.
 *
 * **Une fois par intention** : un double clic n'envoie qu'un essai.
 *
 * **Par nature** (doc `la-desinscription-et-l-accord.md`, lot U5) :
 * l'identité `marketing` d'un espace se règle comme la transactionnelle, avec
 * les mêmes règles, et seulement pour un espace qui envoie du marketing.
 */
@CommandHandler(ChangeMailSenderCommand)
export class ChangeMailSenderHandler implements ICommandHandler<ChangeMailSenderCommand, void> {
  constructor(
    private readonly senders: MailSpaceSenderRepository,
    private readonly domains: VerifiedSendingDomains,
    private readonly trial: MailSenderTrial,
    private readonly contacts: StaffContacts,
    private readonly releases: MailCopyReleaseRepository,
    private readonly cache: PublishedMailCopyCache,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * @throws {UnknownMailSpaceError} l'espace n'existe pas.
   * @throws {UnknownMailNatureError} la nature n'existe pas.
   * @throws {MailSenderNatureNotOfferedError} l'espace ne règle pas cette nature (`lfd` marketing).
   * @throws {MailSenderChangedError} la révision lue a été dépassée.
   * @throws {MailSenderRefusedError} l'identité est mal formée.
   * @throws {SendingDomainsUnavailableError} les domaines n'ont pas pu être lus.
   * @throws {SenderDomainNotVerifiedError} le domaine n'est pas vérifié chez Resend.
   * @throws {TrialRecipientMissingError} la fiche de l'auteur n'a pas d'adresse active.
   * @throws {MailSenderTrialRefusedError} Resend a refusé l'essai.
   */
  async execute(command: ChangeMailSenderCommand): Promise<void> {
    const space = mailSpaceOfParam(command.space);
    const nature = mailNatureOfParam(command.nature);
    return this.intents.run(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "mail.sender-change",
        subject: `${space}:${nature}`,
      },
      NOTHING_TO_REPLAY,
      () => this.change(space, nature, command),
    );
  }

  private async change(
    space: MailSpace,
    nature: MailNature,
    command: ChangeMailSenderCommand,
  ): Promise<void> {
    (await this.senders.load(space, nature)).assertRevision(command.expectedRevision);
    const verified = await this.domains.verified();
    assertSendable(space, command.identity, verified);
    const to = await this.recipientOf(command.staffUserId);
    await this.trial.send(space, command.identity, to, command.intentKey);
    const stamp: MailSenderStamp = { at: this.clock.now(), staffId: command.staffUserId };
    await this.uow.run(async () => {
      const sender = await this.senders.load(space, nature);
      sender.change(command.identity, verified, command.expectedRevision, stamp);
      const release = await this.releases.load();
      release.markDocumentChange();
      await this.releases.save(release, stamp);
      await this.senders.save(sender);
      const { revision, identity } = sender.snapshot();
      if (identity !== null) {
        await this.events.publishTraced(
          new MailSenderChangedEvent(space, nature, revision, identity, release.version),
        );
      }
    });
    this.cache.forget();
  }

  private async recipientOf(staffUserId: string): Promise<string> {
    const contact = (await this.contacts.contactsOf([staffUserId])).get(staffUserId);
    if (contact === undefined || !contact.active || contact.email.trim() === "") {
      throw new TrialRecipientMissingError();
    }
    return contact.email;
  }
}
