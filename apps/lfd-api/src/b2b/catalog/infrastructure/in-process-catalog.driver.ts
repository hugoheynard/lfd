import { Injectable } from "@nestjs/common";
import type { CatalogIngestionReport, CatalogSnapshot } from "@lfd/catalog-sync";

import { AppConfig } from "../../../platform/config/app-config.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
// `b2b` conforme au port publié par `pim`, jamais l'inverse. Le référentiel
// ignore toujours qui le consomme.
import {
  B2bCatalogDriver,
  type CatalogDeliveryOrigin,
} from "../../../pim/channels/b2b-platform/products/driver.js";
import { IngestCatalogService } from "../application/ingest-catalog.service.js";
import { CatalogDelivery } from "../domain/entities/catalog-delivery.js";
import { CatalogDeliveryRepository } from "../domain/ports/catalog-delivery.repository.js";

/**
 * Le canal B2B **en processus** : le référentiel et la plateforme partagent le
 * même déploiement, donc « envoyer » est un appel de méthode.
 *
 * ## Deux chemins, un seul actif — et le choix se fait au démarrage
 *
 * Derrière `B2B_DELIVERY_INBOX` :
 *
 * - **fermé** (le défaut) : l'ingestion écrit les faits de vente. Livrer et
 *   mettre en vente restent le même geste ;
 * - **ouvert** : la livraison dépose une **arrivée**, que la plateforme valide
 *   ensuite. Rien n'est en vente tant que personne n'a relu.
 *
 * ⚠️ Le drapeau est lu au **démarrage** — `AppConfig` lit l'environnement dans
 * son constructeur. Le retour arrière coûte donc un déploiement, pas un clic. Ce
 * qui le rend propre malgré ce délai : en mode fermé, la table d'arrivées n'a
 * **aucun lecteur**. Revenir en arrière ne demande rien d'autre que de
 * redéployer ; les lignes en attente deviennent inertes.
 *
 * ## Ce que le rapport dit dans chaque cas
 *
 * Les compteurs valent la même chose des deux côtés — ce qui est ARRIVÉ. C'est
 * `status` qui change de sens : `applied`, le client voit le nouveau catalogue ;
 * `queued`, il ne voit encore rien. Sans ce champ, l'émetteur lirait
 * « 92 acceptés, aucun retrait » et conclurait que tout est en ligne, alors que
 * des retraits attendent précisément d'être relus.
 */
@Injectable()
export class InProcessB2bCatalogDriver extends B2bCatalogDriver {
  readonly mode = "live" as const;

  constructor(
    private readonly ingestion: IngestCatalogService,
    private readonly deliveries: CatalogDeliveryRepository,
    private readonly config: AppConfig,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async send(
    snapshot: CatalogSnapshot,
    origin: CatalogDeliveryOrigin,
  ): Promise<CatalogIngestionReport> {
    return this.config.deliveryInboxEnabled()
      ? this.receive(snapshot, origin)
      : this.applyNow(snapshot);
  }

  /** Le chemin historique : les faits de vente, tout de suite. */
  private async applyNow(snapshot: CatalogSnapshot): Promise<CatalogIngestionReport> {
    const outcome = await this.ingestion.apply(snapshot);
    return {
      acceptedProducts: outcome.acceptedProducts,
      acceptedVariants: outcome.acceptedVariants,
      acceptedCategories: outcome.acceptedCategories,
      removedSkus: [...outcome.removedSkus],
      appliedAt: new Date(this.clock.now()).toISOString(),
      status: "applied",
    };
  }

  /**
   * Le chemin visé : on dépose, on ne vend pas.
   *
   * `removedSkus` reste **vide**, et c'est exact plutôt que prudent : rien n'a
   * été retiré de la vente. Ce que l'arrivée porte comme retraits se lit dans
   * son diff, à l'écran de validation — pas dans un rapport d'ingestion qui
   * dirait ce qui n'a pas eu lieu.
   */
  private async receive(
    snapshot: CatalogSnapshot,
    origin: CatalogDeliveryOrigin,
  ): Promise<CatalogIngestionReport> {
    const receivedAt = new Date(this.clock.now());
    await this.deliveries.deliver(
      CatalogDelivery.receive({
        id: this.ids.next(),
        // L'ancre voyage avec le snapshot : la plateforme ne peut pas la lire
        // elle-même sans franchir la frontière vers les tables du référentiel.
        revisionId: origin.revisionId,
        snapshot,
        fingerprint: origin.fingerprint,
        receivedAt,
      }),
    );

    return {
      acceptedProducts: snapshot.products.length,
      acceptedVariants: snapshot.products.reduce(
        (total, product) => total + product.variants.length,
        0,
      ),
      acceptedCategories: snapshot.categories.length,
      removedSkus: [],
      appliedAt: receivedAt.toISOString(),
      status: "queued",
    };
  }
}
