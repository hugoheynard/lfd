import type { CompanyPricingCategoryView } from "@lfd/contracts";

import type { CatalogItem } from "../../../catalog/domain/ports/product-catalog.reader.js";
import type { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import type { PricingParties } from "../../domain/loaded-pricer.js";
import type { LoadedRule } from "./pricing-decisions.reader.js";

/**
 * **Ce que paie un client à une date, pour une mercuriale donnée** — les
 * matériaux d'un dossier tarifaire lus une fois, puis résolus autant de fois
 * qu'il y a de mercuriales à essayer.
 *
 * La mercuriale est FOURNIE, jamais relue : l'onglet « Tarifs » passe celle qui
 * agit, l'aperçu d'un avenant passe l'originale puis sa copie amendée en
 * mémoire. Les deux résolutions partagent alors exactement les mêmes règles,
 * promotions, limites et barèmes — seul l'avenant diffère.
 */
export interface CompanyPriceSheet {
  readonly at: Date;
  readonly parties: PricingParties;
  /** Le catalogue lu au nom de ce client, articles réservés à un autre compris. */
  readonly catalogue: readonly CatalogItem[];
  /** Les règles retenues pour l'écran (sans l'étage promotion), avec leur vue. */
  readonly rules: readonly LoadedRule[];
  /** Chaque article, par famille, résolu par `resolvePrice` sous cette mercuriale. */
  categoriesWith(mercuriale: CompanyMercuriale | null): Promise<CompanyPricingCategoryView[]>;
}

/**
 * Port de **lecture** : prépare la feuille d'un client à `at`. Daté de bout en
 * bout — compte de tarif, décisions, barèmes et promotions sont lus à `at`.
 */
export abstract class CompanyPriceSheets {
  abstract sheetFor(
    companyId: string,
    parties: PricingParties,
    at: Date,
  ): Promise<CompanyPriceSheet>;
}
