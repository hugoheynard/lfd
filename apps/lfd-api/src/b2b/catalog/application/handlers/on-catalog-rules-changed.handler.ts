import { Injectable } from "@nestjs/common";

import {
  CatalogRulesChangedFact,
  PIM_CATALOG_RULES_CHANGED,
} from "../../../../pim/channels/b2b-platform/products/catalog-rules-changed.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { CatalogRulesProjection } from "../../domain/ports/catalog-rules.projection.js";
import { OrderLimitsRefresher } from "../order-limits-refresher.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const PROJECT_CATALOG_RULES = "catalog.project-catalog-rules";

/**
 * **Les règles globales du référentiel arrivent sur la plateforme** (lot 2b
 * de `documentation/pim/plan-catalogue-synchronise-par-audience.md`, C3).
 *
 * Dans la transaction de la livraison : l'échelle des limites de commande est
 * rangée **si ce fait est plus récent** que celle tenue (`applied_seq`), puis
 * descendue sur chaque article en vente — comme l'ingestion du push le fait
 * depuis la v7 du fil, ce sont les RÈGLES qui traversent. Un fait plus ancien
 * n'écrit rien.
 *
 * 🔴 **Il lève** sur un fait illisible : la livraison se rejoue, puis passe en
 * lettre morte, visible sur la carte de santé.
 */
@Injectable()
@DurableHandler({ type: PIM_CATALOG_RULES_CHANGED, subscriber: PROJECT_CATALOG_RULES })
export class OnCatalogRulesChangedHandler implements DurableSubscriber {
  constructor(
    private readonly projection: CatalogRulesProjection,
    private readonly limits: OrderLimitsRefresher,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = CatalogRulesChangedFact.fromPayload(delivery.payload);
    const recorded = await this.projection.recordOrderTimeLimitsIfNewer(
      fact.orderTimeLimits,
      fact.seq,
      new Date(fact.emittedAt),
    );
    if (recorded) {
      await this.limits.refresh(null);
    }
  }
}
