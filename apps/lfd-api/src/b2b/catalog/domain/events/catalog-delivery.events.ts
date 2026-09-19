import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";

/**
 * **Le fait d'une arrivée validée** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche (b),
 * 2026-09-19).
 *
 * L'arrivée, la version et l'historique des prix gardent déjà chacun une
 * trace ; ce fait les relie au journal, pour que la validation s'y lise à côté
 * des décisions de catalogue qu'elle côtoie. La charge nomme ce qu'il faut
 * pour rouvrir les trois : l'arrivée, la révision du référentiel qu'elle
 * portait, la version qu'elle a posée — et les SKU écartés, la moitié du geste.
 */
export const CATALOG_DELIVERY_FACTS = {
  accepted: "catalog_delivery.accepted",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "catalog_delivery";

/** Ce que la validation a décidé, tel que le journal le relit. */
export interface CatalogDeliveryAcceptance {
  readonly deliveryId: string;
  readonly revisionId: string;
  readonly versionId: string;
  readonly excludedSkus: readonly string[];
}

/** Fait : **une arrivée du référentiel est validée**, écartés compris. */
export class CatalogDeliveryAcceptedEvent implements JournaledEvent {
  constructor(readonly acceptance: CatalogDeliveryAcceptance) {}

  journalFact(): JournalFact {
    return {
      type: CATALOG_DELIVERY_FACTS.accepted,
      subjectType: SUBJECT_TYPE,
      subjectId: this.acceptance.deliveryId,
      payload: {
        deliveryId: this.acceptance.deliveryId,
        revisionId: this.acceptance.revisionId,
        versionId: this.acceptance.versionId,
        excludedSkus: [...this.acceptance.excludedSkus],
      },
    };
  }
}
