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
import { OrderLimitsRefresher } from "../order-limits-refresher.service.js";
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
 * Une famille ARCHIVÉE au référentiel n'est jamais supprimée ici : elle pose
 * `withdrawn_at` (lot 2b), et son audience est rangée avec elle. Ses articles,
 * eux, sortent de la vente par les faits de leurs fiches.
 *
 * Appliquée, elle fait redescendre les limites de commande de tous les
 * articles : un déplacement de famille change la lignée de ses descendantes.
 */
@Injectable()
@DurableHandler({ type: PIM_CATALOG_CATEGORY_CHANGED, subscriber: PROJECT_CATALOG_CATEGORY })
export class OnCatalogCategoryChangedHandler implements DurableSubscriber {
  constructor(
    private readonly projection: CatalogFamilyFactsProjection,
    private readonly limits: OrderLimitsRefresher,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = CatalogCategoryChangedFact.fromPayload(delivery.payload);
    const applied = await this.projection.applyIfNewer(
      receivedFamilyOf(fact.family, new Date(fact.emittedAt)),
      fact.seq,
    );
    if (applied) {
      await this.limits.refresh(null);
    }
  }
}
