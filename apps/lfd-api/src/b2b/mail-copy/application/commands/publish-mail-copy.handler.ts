import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailCopyReleaseRepository } from "../../domain/ports/mail-copy-release.repository.js";
import { PublishedMailCopyCache } from "../../domain/ports/published-mail-copy.cache.js";
import { MailCopyManifest } from "../../domain/mail-copy-manifest.js";
import { MailCopyPublishedEvent } from "../../domain/mail-copy.events.js";
import { PublishMailCopyCommand } from "./publish-mail-copy.command.js";

/**
 * Publie tous les brouillons, en une transaction : version, textes et fait au
 * journal partent ensemble, ou rien ne part. Rend la version posée — un
 * identifiant, pas un modèle de lecture.
 *
 * Le cache du publié de CETTE instance est oublié **après** la validation :
 * l'oublier pendant laisserait un envoi concurrent recharger l'état d'avant,
 * et le garder.
 */
@CommandHandler(PublishMailCopyCommand)
export class PublishMailCopyHandler implements ICommandHandler<PublishMailCopyCommand, number> {
  constructor(
    private readonly releases: MailCopyReleaseRepository,
    private readonly manifest: MailCopyManifest,
    private readonly cache: PublishedMailCopyCache,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {NothingToPublishError} aucun brouillon n'attend.
   * @throws {MailCopyPublishedMeanwhileError} une autre publication l'a précédée.
   * @throws {MailCopyChangedError} un brouillon a été réécrit pendant la publication.
   */
  async execute(command: PublishMailCopyCommand): Promise<number> {
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    const version = await this.uow.run(async () => {
      const release = await this.releases.load();
      const changes = release.publish(this.manifest, stamp);
      await this.releases.save(release, stamp);
      await this.events.publishTraced(new MailCopyPublishedEvent(release.version, changes));
      return release.version;
    });
    this.cache.forget();
    return version;
  }
}
