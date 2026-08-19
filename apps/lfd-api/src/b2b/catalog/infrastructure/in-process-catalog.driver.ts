import { Injectable } from "@nestjs/common";
import type { CatalogIngestionReport, CatalogSnapshot } from "@lfd/catalog-sync";

import { B2bCatalogDriver } from "../../../pim/channels/b2b-platform/products/driver.js";
import { IngestCatalogService } from "../application/ingest-catalog.service.js";

/**
 * L'envoi réel du fil catalogue — **dans le processus**.
 *
 * C'est le seul symbole que la plateforme emprunte au référentiel, et il va
 * dans le sens autorisé : `b2b` conforme au port publié par `pim`, jamais
 * l'inverse. Le référentiel ignore toujours qui le consomme.
 *
 * Ce que la version HTTP faisait en plus, et qui a disparu avec elle : un
 * secret partagé à faire tourner, une identité machine-à-machine, un
 * `fetch` qui pouvait échouer entre deux containers, et une revalidation du
 * rapport de retour — on ne se relit pas soi-même. Ce qui reste est la seule
 * chose que le fil ait jamais eu à faire : appliquer un snapshot par les
 * agrégats du catalogue.
 *
 * `appliedAt` est daté **après** l'application, pas au départ : c'est
 * l'instant où la plateforme a réellement pris le snapshot, et c'est lui que
 * l'écran affiche.
 */
@Injectable()
export class InProcessB2bCatalogDriver extends B2bCatalogDriver {
  readonly mode = "live" as const;

  constructor(private readonly ingestion: IngestCatalogService) {
    super();
  }

  async send(snapshot: CatalogSnapshot): Promise<CatalogIngestionReport> {
    const outcome = await this.ingestion.apply(snapshot);
    return {
      acceptedProducts: outcome.acceptedProducts,
      acceptedVariants: outcome.acceptedVariants,
      acceptedCategories: outcome.acceptedCategories,
      removedSkus: [...outcome.removedSkus],
      appliedAt: new Date().toISOString(),
    };
  }
}
