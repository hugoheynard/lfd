import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";

/**
 * **Le fait du retraçage des prix** (lot D de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`,
 * 2026-10-15) : l'historique des prix a reçu le prix du référentiel pour ces
 * articles, parce que leur dernière trace était un prix qui n'est plus servi.
 *
 * Le sujet est l'historique du catalogue, qui n'a pas de nom ; les SKU
 * retracés disent ce qui a bougé. Les prix n'y sont pas : ils sont dans
 * l'historique, daté du même instant.
 */
export const CATALOG_PRICE_HISTORY_FACTS = {
  retraced: "catalog_price_history.retraced",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "catalog_price_history";
/** Il n'y a qu'un historique des prix : son identifiant est son nom. */
const SUBJECT_ID = "catalog";

/** Fait : **le prix du référentiel est retracé** pour ces articles. */
export class CatalogPricesRetracedEvent implements JournaledEvent {
  constructor(readonly skus: readonly string[]) {}

  journalFact(): JournalFact {
    return {
      type: CATALOG_PRICE_HISTORY_FACTS.retraced,
      subjectType: SUBJECT_TYPE,
      subjectId: SUBJECT_ID,
      payload: { skus: [...this.skus] },
    };
  }
}
