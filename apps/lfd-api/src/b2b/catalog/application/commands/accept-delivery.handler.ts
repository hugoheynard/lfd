import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { StoredCatalogSnapshot } from "@lfd/catalog-sync";

import { ResourceNotFoundError } from "../../../../platform/shared/errors/app-error.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { CatalogDelivery } from "../../domain/entities/catalog-delivery.js";
import { CatalogVersion } from "../../domain/entities/catalog-version.js";
import { UnknownExcludedSkuError } from "../../domain/errors/catalog-errors.js";
import { CatalogDeliveryAcceptedEvent } from "../../domain/events/catalog-delivery.events.js";
import { CatalogDeliveryRepository } from "../../domain/ports/catalog-delivery.repository.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { CatalogOperationRepository } from "../../domain/ports/catalog-operation.repository.js";
import { CatalogVersionRepository } from "../../domain/ports/catalog-version.repository.js";
import { IngestCatalogService } from "../ingest-catalog.service.js";
import { AcceptDeliveryCommand } from "./accept-delivery.command.js";

/** L'arrivée visée n'existe pas — un identifiant d'un autre écran, ou d'hier. */
class DeliveryNotFoundError extends ResourceNotFoundError {
  constructor(readonly deliveryId: string) {
    super("catalog.delivery.not_found", `Arrivée « ${deliveryId} » inconnue.`);
  }
}

/**
 * **Valider une arrivée : promouvoir ce qui a été relu.**
 *
 * Quatre choses se jouent ici, et l'ordre entre elles n'est pas indifférent.
 *
 * ## 1. La clôture AVANT l'application
 *
 * `close()` porte `status = 'pending'` dans son `where` : c'est le **verrou**.
 * Clore d'abord garantit qu'une seule validation applique les faits — deux clics
 * simultanés lisent tous deux une arrivée ouverte, la referment tous deux en
 * mémoire, et seule la première écrit. L'inverse — appliquer puis clore —
 * appliquerait deux fois avant de s'en apercevoir.
 *
 * ## 2. Les deux dans une TRANSACTION
 *
 * Le verrou ne suffit pas seul : si l'application échoue après la clôture,
 * l'arrivée serait close sans que les faits soient écrits, et personne ne
 * pourrait la rejouer. La transaction rend l'ensemble tout-ou-rien.
 *
 * ## 3. Les SKU écartés sont vérifiés contre l'arrivée ET le miroir
 *
 * ⚠️ La garde évidente — « refuser un SKU absent de l'arrivée » — est **fausse**,
 * et c'est le genre de détail qui ne se voit qu'en écrivant le code : un retrait
 * EST un SKU absent de l'arrivée. L'interdire rendrait impossible le refus d'un
 * retrait, c'est-à-dire le cas où l'on tient le plus à garder un article.
 *
 * ## 4. La version est posée dans la MÊME transaction
 *
 * Une validation qui promeut des faits sans archiver ce qu'elle a promu laisse
 * un catalogue dont l'histoire commence à la prochaine livraison. Les mettre
 * dans deux transactions rendrait cet état atteignable ; ici il ne l'est pas.
 *
 * La photographie est prise sur le **miroir relu**, après application — jamais
 * sur le snapshot reçu, qui dirait changé un SKU qu'on vient d'écarter.
 *
 * ## Ce qui trace — et le fait au journal
 *
 * Trois traces existent, et elles restent : **qui a validé** vit sur l'arrivée
 * (`accepted_at`, `accepted_by`, et les SKU écartés), **ce qui a été accepté**
 * dans la version, et **ce que ça a changé aux prix** s'inscrit tout seul dans
 * `catalog_price_history`, que `saveMany` alimente dans la même transaction.
 *
 * Ce JSDoc justifiait l'absence de journal par « ce contexte n'en a aucun ».
 * C'est faux depuis le 2026-09-19 : les décisions voisines — un prix négocié,
 * un article masqué — y écrivent leurs faits (`catalog-decision.handlers.ts`,
 * vérifié ce jour-là ; découpé en un fichier par geste le 2026-09-19, cf.
 * `catalog-decision-support.ts`). La validation y écrit donc aussi le sien,
 * `catalog_delivery.accepted`, dans la même transaction que la clôture : sans
 * lui, elle serait la seule décision du catalogue qu'on ne lirait pas dans le
 * journal. Il ne remplace aucune des trois traces ; il les nomme.
 */
@CommandHandler(AcceptDeliveryCommand)
export class AcceptDeliveryHandler implements ICommandHandler<AcceptDeliveryCommand, void> {
  constructor(
    private readonly deliveries: CatalogDeliveryRepository,
    private readonly items: CatalogItemRepository,
    private readonly operations: CatalogOperationRepository,
    private readonly versions: CatalogVersionRepository,
    private readonly ingest: IngestCatalogService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AcceptDeliveryCommand): Promise<void> {
    const delivery = await this.deliveries.byId(command.deliveryId);
    if (delivery === null) {
      throw new DeliveryNotFoundError(command.deliveryId);
    }

    await this.refuseUnknownExclusions(delivery.snapshot, command.excludedSkus);

    // UN seul instant pour les deux écritures : l'arrivée et la version qu'elle
    // produit ne doivent pas différer d'une milliseconde, sans quoi « la version
    // posée par cette validation » devient une question de tri.
    const acceptedAt = new Date(this.clock.now());
    delivery.accept(command.excludedSkus, acceptedAt, command.acceptedBy);

    await this.uow.run(async () => {
      // Le verrou d'abord : il lève si quelqu'un a validé entre-temps, et rien
      // n'est appliqué.
      await this.deliveries.close(delivery);
      await this.ingest.apply(delivery.snapshot, command.excludedSkus);

      const versionId = await this.photograph(delivery, command, acceptedAt);

      await this.events.publishTraced(
        new CatalogDeliveryAcceptedEvent({
          deliveryId: delivery.id,
          revisionId: delivery.revisionId,
          versionId,
          excludedSkus: command.excludedSkus,
        }),
      );
    });
  }

  /**
   * Pose la version et rend son identifiant.
   *
   * La photographie est prise APRÈS l'application, et sur le miroir relu —
   * pas sur le snapshot reçu. C'est ce qui la rend juste pour un SKU écarté,
   * qui garde ses faits COURANTS : le snapshot le dirait changé, le miroir
   * le dit inchangé. La relecture coûte une requête par validation, soit un
   * geste humain par jour ; la déduire du snapshot coûterait la vérité.
   */
  private async photograph(
    delivery: CatalogDelivery,
    command: AcceptDeliveryCommand,
    acceptedAt: Date,
  ): Promise<string> {
    const versionId = this.ids.next();
    await this.versions.append(
      CatalogVersion.photograph({
        id: versionId,
        deliveryId: delivery.id,
        revisionId: delivery.revisionId,
        fingerprint: delivery.fingerprint,
        excludedSkus: command.excludedSkus,
        createdAt: acceptedAt,
        createdBy: command.acceptedBy,
        mirror: await this.items.loadAll(),
        // Les opérations aussi, relues après application comme les articles
        // (D10) : « qu'était-il possible de commander le 20 décembre ? ».
        operations: await this.operations.loadAllIncludingWithdrawn(),
      }),
    );
    return versionId;
  }

  /**
   * Un SKU écarté doit exister quelque part — dans l'arrivée (on refuse son
   * changement) ou dans le miroir (on refuse son retrait). Ailleurs, c'est une
   * faute de frappe qui passerait sans bruit, et l'opérateur croirait avoir
   * écarté quelque chose.
   */
  private async refuseUnknownExclusions(
    snapshot: StoredCatalogSnapshot,
    excludedSkus: readonly string[],
  ): Promise<void> {
    if (excludedSkus.length === 0) {
      return;
    }
    const known = new Set(
      snapshot.products.flatMap((product) => product.variants.map((variant) => variant.sku)),
    );
    for (const item of await this.items.loadAll()) {
      known.add(item.sku);
    }
    const unknown = excludedSkus.filter((sku) => !known.has(sku));
    if (unknown.length > 0) {
      throw new UnknownExcludedSkuError(unknown);
    }
  }
}
