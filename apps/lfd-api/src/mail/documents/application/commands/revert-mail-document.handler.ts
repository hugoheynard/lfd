import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailCopyReleaseRepository } from "../../../copy/domain/ports/mail-copy-release.repository.js";
import { PublishedMailCopyCache } from "../../../copy/domain/ports/published-mail-copy.cache.js";
import { UnknownMailTemplateError } from "../../domain/mail-document-errors.js";
import { MailDocumentRetractedEvent } from "../../domain/mail-document.events.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { MailTemplateDocumentRepository } from "../../domain/ports/mail-template-document.repository.js";
import { RevertMailDocumentCommand } from "./revert-mail-document.command.js";

/**
 * **Revenir au modèle d'origine** (plan `plan-editeur-par-blocs.md`, § 5) :
 * le document publié est retiré, le brouillon effacé, et l'e-mail repart dans
 * son arrangement de départ. Ses phrases n'ont jamais quitté le
 * dictionnaire : elles ne bougent pas, brouillons compris.
 *
 * La version des textes monte quand même : c'est l'estampille du cache du
 * publié, et sans elle les autres instances enverraient encore le document
 * retiré. Rend cette version.
 */
@CommandHandler(RevertMailDocumentCommand)
export class RevertMailDocumentHandler implements ICommandHandler<
  RevertMailDocumentCommand,
  number
> {
  constructor(
    private readonly documents: MailTemplateDocumentRepository,
    private readonly releases: MailCopyReleaseRepository,
    private readonly catalogue: MailTemplateCatalogue,
    private readonly cache: PublishedMailCopyCache,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre.
   * @throws {NothingToRevertError} ni document publié, ni brouillon.
   * @throws {MailDocumentChangedError} le document a été écrit depuis la lecture.
   * @throws {MailCopyPublishedMeanwhileError} une publication l'a précédé.
   */
  async execute(command: RevertMailDocumentCommand): Promise<number> {
    if (this.catalogue.find(command.template) === null) {
      throw new UnknownMailTemplateError(command.template);
    }
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    const version = await this.uow.run(async () => {
      const document = await this.documents.load(command.template);
      const retracted = document.revert(command.expectedRevision, stamp);
      const release = await this.releases.loadFor(command.template);
      release.markDocumentChange();
      await this.releases.save(release, stamp);
      await this.documents.save(document);
      await this.events.publishTraced(
        new MailDocumentRetractedEvent(command.template, retracted, release.version),
      );
      return release.version;
    });
    this.cache.forget();
    return version;
  }
}
