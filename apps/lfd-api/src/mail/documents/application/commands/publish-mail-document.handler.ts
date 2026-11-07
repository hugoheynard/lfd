import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailCopyManifest } from "../../../copy/domain/mail-copy-manifest.js";
import { MailCopyPublishedEvent } from "../../../copy/domain/mail-copy.events.js";
import { MailCopyReleaseRepository } from "../../../copy/domain/ports/mail-copy-release.repository.js";
import { PublishedMailCopyCache } from "../../../copy/domain/ports/published-mail-copy.cache.js";
import {
  NothingToPublishForMailError,
  UnknownMailTemplateError,
} from "../../domain/mail-document-errors.js";
import { MailDocumentPublishedEvent } from "../../domain/mail-document.events.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { MailTemplateDocumentRepository } from "../../domain/ports/mail-template-document.repository.js";
import { PublishMailDocumentCommand } from "./publish-mail-document.command.js";

/**
 * **Une seule publication** pour un e-mail (plan `plan-editeur-par-blocs.md`,
 * § 11) : son arrangement ET ses phrases en attente — textes et ordre des
 * sections de CET e-mail, pas ceux des autres — partent dans la même
 * transaction, sous la même version des textes, ou rien ne part. Rend cette
 * version — un identifiant, pas un modèle de lecture.
 *
 * Le cache du publié de CETTE instance est oublié **après** la validation,
 * pour la raison de `PublishMailCopyHandler` ; les autres instances le voient
 * à leur prochaine relecture de la version.
 */
@CommandHandler(PublishMailDocumentCommand)
export class PublishMailDocumentHandler implements ICommandHandler<
  PublishMailDocumentCommand,
  number
> {
  constructor(
    private readonly documents: MailTemplateDocumentRepository,
    private readonly releases: MailCopyReleaseRepository,
    private readonly catalogue: MailTemplateCatalogue,
    private readonly manifest: MailCopyManifest,
    private readonly cache: PublishedMailCopyCache,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre.
   * @throws {NothingToPublishForMailError} ni brouillon d'arrangement, ni phrase en attente.
   * @throws {MailDocumentRefusedError} le brouillon enfreint une règle de publication.
   * @throws {MailDocumentChangedError} le document a été écrit depuis la lecture.
   * @throws {MailCopyPublishedMeanwhileError} une autre publication l'a précédée.
   */
  async execute(command: PublishMailDocumentCommand): Promise<number> {
    const entry = this.catalogue.find(command.template);
    if (entry === null) {
      throw new UnknownMailTemplateError(command.template);
    }
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    const version = await this.uow.run(async () => {
      const document = await this.documents.load(command.template);
      const previous = document.publishedVersion;
      const published = document.publish(entry.declaration, command.expectedRevision, stamp);
      const release = await this.releases.loadFor(command.template);
      if (published === null && !release.hasPublishable(this.manifest)) {
        throw new NothingToPublishForMailError(command.template);
      }
      const phrases = release.publish(this.manifest, stamp, { withDocument: published !== null });
      await this.releases.save(release, stamp);
      const facts: JournaledEvent[] = [];
      if (phrases.texts.length + phrases.sectionOrders.length > 0) {
        facts.push(
          new MailCopyPublishedEvent(release.version, phrases.texts, phrases.sectionOrders),
        );
      }
      if (published !== null) {
        await this.documents.save(document);
        facts.push(
          new MailDocumentPublishedEvent(
            command.template,
            published.version,
            previous,
            release.version,
          ),
        );
      }
      await this.events.publishTracedAll(facts);
      return release.version;
    });
    this.cache.forget();
    return version;
  }
}
