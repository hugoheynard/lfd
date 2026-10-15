import { Injectable } from "@nestjs/common";

import {
  CatalogCategoryChangedFact,
  PIM_CATALOG_CATEGORY_CHANGED,
} from "../../../../pim/channels/b2b-platform/products/catalog-category-changed.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { CatalogFamilyFactsProjection } from "../../domain/ports/catalog-family-facts.projection.js";
import { receivedFamilyOf } from "./catalog-fact-mapping.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const PROJECT_CATALOG_CATEGORY = "catalog.project-catalog-category";

/**
 * **Une famille du référentiel arrive sur la plateforme** (2a4, « même schéma
 * pour la famille »).
 *
 * Écriture conditionnée sur `catalog_categories.applied_seq` : un fait plus
 * ancien que la ligne n'écrit rien ; le premier fait d'une famille posée par
 * un push ou apportée par une fiche s'applique toujours.
 *
 * ⚠️ Une famille ARCHIVÉE au référentiel n'est pas supprimée ici, et rien ne
 * la marque encore côté plateforme : `catalog_categories` n'a pas de colonne
 * de retrait (le plan n'en prévoit pas au lot 2a). Ses articles, eux, sortent
 * de la vente par les faits de leurs fiches.
 */
@Injectable()
@DurableHandler({ type: PIM_CATALOG_CATEGORY_CHANGED, subscriber: PROJECT_CATALOG_CATEGORY })
export class OnCatalogCategoryChangedHandler implements DurableSubscriber {
  constructor(private readonly projection: CatalogFamilyFactsProjection) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = CatalogCategoryChangedFact.fromPayload(delivery.payload);
    await this.projection.applyIfNewer(
      receivedFamilyOf(fact.family, new Date(fact.emittedAt)),
      fact.seq,
    );
  }
}
