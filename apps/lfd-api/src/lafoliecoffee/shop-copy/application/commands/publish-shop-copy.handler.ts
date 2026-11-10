import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PublishedShopCopyCache } from "../../domain/ports/published-shop-copy.reader.js";
import { ShopCopyEdgeCache } from "../../domain/ports/shop-copy-edge-cache.js";
import { ShopCopyReleaseRepository } from "../../domain/ports/shop-copy-release.repository.js";
import { ShopCopyManifest } from "../../domain/shop-copy-manifest.js";
import { ShopCopyPublishedEvent } from "../../domain/shop-copy.events.js";
import { PublishShopCopyCommand } from "./publish-shop-copy.command.js";

/**
 * Publie tous les brouillons, en une transaction : version, textes et fait au
 * journal partent ensemble, ou rien ne part. Rend la version posée — un
 * identifiant, pas un modèle de lecture (§4).
 *
 * Le cache de lecture de CETTE instance est oublié **après** la validation :
 * l'oublier pendant laisserait une lecture concurrente recharger l'état
 * d'avant, et le garder.
 *
 * Les textes gardés par Workers Cache sont purgés, eux aussi, **après** la
 * validation (`AfterCommit`) : une publication qui échoue ne purge rien.
 * La purge n'est pas attendue ; son échec est journalisé et ne retient pas
 * la publication — les visiteurs la voient alors à l'échéance du cache.
 */
@CommandHandler(PublishShopCopyCommand)
export class PublishShopCopyHandler implements ICommandHandler<PublishShopCopyCommand, number> {
  constructor(
    private readonly releases: ShopCopyReleaseRepository,
    private readonly manifest: ShopCopyManifest,
    private readonly cache: PublishedShopCopyCache,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly afterCommit: AfterCommit,
    private readonly edge: ShopCopyEdgeCache,
  ) {}

  /**
   * @throws {NothingToPublishError} aucun brouillon n'attend.
   * @throws {ShopCopyPublishedMeanwhileError} une autre publication l'a précédée.
   * @throws {ShopCopyChangedError} un brouillon a été réécrit pendant la publication.
   */
  async execute(command: PublishShopCopyCommand): Promise<number> {
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    const version = await this.uow.run(async () => {
      const release = await this.releases.load();
      const changes = release.publish(this.manifest, stamp);
      await this.releases.save(release, stamp);
      await this.events.publishTraced(new ShopCopyPublishedEvent(release.version, changes));
      this.afterCommit.defer(() => this.edge.purge(), "shop-copy.edge-purge");
      return release.version;
    });
    this.cache.forget();
    return version;
  }
}
