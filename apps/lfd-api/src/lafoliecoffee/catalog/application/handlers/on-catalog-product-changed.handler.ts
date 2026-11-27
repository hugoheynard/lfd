import { Injectable } from "@nestjs/common";

import {
  CatalogProductChangedFact,
  PIM_CATALOG_PRODUCT_CHANGED,
} from "../../../../pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { itemsOnSale } from "../../domain/catalog-product-facts.js";
import { CatalogOptionGroupsProjection } from "../../domain/ports/catalog-option-groups.projection.js";
import { CatalogProductFactsProjection } from "../../domain/ports/catalog-product-facts.projection.js";
import { OrderLimitsRefresher } from "../order-limits-refresher.service.js";
import {
  receivedFamilyOf,
  receivedOptionGroupsOf,
  receivedProductOf,
} from "./catalog-fact-mapping.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const PROJECT_CATALOG_PRODUCT = "catalog.project-catalog-product";

/**
 * **Une fiche du référentiel arrive sur la plateforme, vendue ou non** (2a4
 * de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`).
 *
 * Dans la transaction de la livraison, qui porte aussi son reçu :
 *
 * 1. la famille de la fiche est créée si la plateforme ne la connaît pas —
 *    jamais mise à jour d'ici ; la fiche peut arriver avant le fait famille ;
 * 2. l'entrée `catalog_entries` s'écrit **si ce fait est plus récent** que la
 *    ligne (`applied_seq`) — sinon rien d'autre ne s'écrit : un fait ancien
 *    rejoué, ou livré deux fois, est inerte ;
 * 3. les déclinaisons vendables d'une fiche active sont mises en vente, chacune
 *    à SON audience — une ligne NEUVE naît « à valider » pour chaque clientèle
 *    que son audience contient (lot 3), et une ligne existante le redevient
 *    quand son audience s'élargit à une clientèle (Q1 de
 *    `plan-audience-par-declinaison.md`, décidé par Hugo le 2026-11-24) ;
 * 4. tout autre article de la fiche encore en vente est retiré — fiche
 *    inactive ou archivée, déclinaison devenue incomplète, SKU renommé ;
 * 5. les limites de commande des articles en vente de la fiche sont
 *    redescendues de l'échelle reçue (lot 2b) — un article neuf reçoit les
 *    siennes. Sans échelle reçue, rien ne bouge ;
 * 6. les groupes d'options de chaque déclinaison sont réécrits
 *    (`plan-options-de-commande.md`, § 3.2), toutes clientèles confondues.
 *
 * ## Ce qu'il ne fait jamais
 *
 * ⚠️ Écrire une décision locale (`catalog_item_overrides`), supprimer une
 * ligne, mettre à jour une famille connue. Une décision de prix survit à
 * n'importe quel nombre de faits (H10).
 *
 * ⚠️ Importer l'intérieur du référentiel : il lit un fait que le référentiel
 * déclare dans son canal ; `pim → b2b` reste interdit.
 *
 * 🔴 **Il lève** sur un fait illisible : la livraison se rejoue, puis passe en
 * lettre morte, visible sur la carte de santé. Avaler ferait enregistrer
 * comme appliqué un fait qui ne l'a pas été.
 */
@Injectable()
@DurableHandler({ type: PIM_CATALOG_PRODUCT_CHANGED, subscriber: PROJECT_CATALOG_PRODUCT })
export class OnCatalogProductChangedHandler implements DurableSubscriber {
  constructor(
    private readonly projection: CatalogProductFactsProjection,
    private readonly limits: OrderLimitsRefresher,
    private readonly optionGroups: CatalogOptionGroupsProjection,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = CatalogProductChangedFact.fromPayload(delivery.payload);
    const product = receivedProductOf(fact);
    // La famille AVANT l'article : `catalog_items.category_id` est une clé
    // étrangère, et la fiche peut précéder le fait de sa famille.
    await this.projection.ensureFamily(receivedFamilyOf(fact.body.family, product.receivedAt));
    if (!(await this.projection.recordEntryIfNewer(product))) {
      return;
    }
    const onSale = itemsOnSale(product);
    await this.projection.putOnSale(onSale);
    await this.projection.withdrawOthers(
      product.productId,
      onSale.map((item) => item.sku),
      product.receivedAt,
    );
    await this.limits.refresh(product.productId);
    await this.optionGroups.record(
      product.productId,
      receivedOptionGroupsOf(fact),
      product.receivedAt,
    );
  }
}
