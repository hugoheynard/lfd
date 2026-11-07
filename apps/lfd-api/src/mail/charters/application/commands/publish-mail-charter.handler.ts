import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailCopyReleaseRepository } from "../../../copy/domain/ports/mail-copy-release.repository.js";
import { PublishedMailCopyCache } from "../../../copy/domain/ports/published-mail-copy.cache.js";
import { MailCharterPublishedEvent } from "../../domain/mail-charter.events.js";
import { MailCharterLogo } from "../../domain/ports/mail-charter-logo.js";
import { MailSpaceCharterRepository } from "../../domain/ports/mail-space-charter.repository.js";
import { MailSpaceDirectory } from "../../domain/ports/mail-space-directory.js";
import { copyCharterLogo } from "../copy-charter-logo.js";
import { mailSpaceOfParam } from "../mail-space-param.js";
import {
  PublishMailCharterCommand,
  type MailCharterPublication,
} from "./publish-mail-charter.command.js";

/**
 * **Publie la charte d'un espace** (plan `plan-editeur-par-blocs.md`, § 25,
 * C1) : le brouillon devient la version suivante, gardée en ajout seul, et
 * vaut pour tous les e-mails de l'espace au prochain envoi.
 *
 * Le brouillon est vérifié (forme, logo et texte de remplacement, contraste)
 * AVANT toute copie ; le logo est copié dans le stockage du bloc hors
 * transaction ; puis la transaction relit, publie avec l'adresse de la copie
 * et fait monter la version des textes des e-mails — l'estampille du cache
 * de l'envoi : sans elle, les autres instances garderaient l'ancienne charte.
 * Le cache de CETTE instance est oublié après la validation.
 */
@CommandHandler(PublishMailCharterCommand)
export class PublishMailCharterHandler implements ICommandHandler<
  PublishMailCharterCommand,
  MailCharterPublication
> {
  constructor(
    private readonly charters: MailSpaceCharterRepository,
    private readonly releases: MailCopyReleaseRepository,
    private readonly directory: MailSpaceDirectory,
    private readonly logo: MailCharterLogo,
    private readonly cache: PublishedMailCopyCache,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {UnknownMailSpaceError} l'espace n'existe pas.
   * @throws {NothingToPublishForCharterError} aucun brouillon.
   * @throws {MailCharterRefusedError} le brouillon enfreint une règle de publication.
   * @throws {MailCharterChangedError} la charte a été écrite depuis la lecture.
   * @throws {MailCharterLogoRefusedError} le logo ne peut pas être copié.
   * @throws {MailCharterLogoUnavailableError} la copie du logo est en panne.
   * @throws {MailCopyPublishedMeanwhileError} une publication des textes l'a précédée.
   */
  async execute(command: PublishMailCharterCommand): Promise<MailCharterPublication> {
    const space = mailSpaceOfParam(command.space);
    const locales = this.directory.localesOf(space);
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    const draft = (await this.charters.load(space)).publishableDraft(
      locales,
      command.expectedRevision,
    );
    const logoCopy = await copyCharterLogo(space, draft, this.logo);
    const publication = await this.uow.run(async () => {
      const charter = await this.charters.load(space);
      const previous = charter.publishedVersion;
      const published = charter.publish(locales, command.expectedRevision, stamp, logoCopy);
      const release = await this.releases.load();
      release.markDocumentChange();
      await this.releases.save(release, stamp);
      await this.charters.save(charter);
      await this.events.publishTraced(
        new MailCharterPublishedEvent(space, published.version, previous, release.version),
      );
      return { version: published.version, publicationVersion: release.version };
    });
    this.cache.forget();
    return publication;
  }
}
