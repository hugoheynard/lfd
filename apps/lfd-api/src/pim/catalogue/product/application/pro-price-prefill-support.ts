import type { ProPricePolicy, ProPricePrefillRowView } from "@lfd/pim-contracts";

import { AccountingRulesNotSetError } from "../../../accounting-rules/domain/errors/accounting-rules-errors.js";
import type { AccountingRulesReader } from "../../../accounting-rules/domain/ports/accounting-rules.reader.js";
import type { CatalogueReader } from "../../shared/domain/ports/catalogue-reader.js";
import type { Product } from "../domain/entities/product.js";
import type { ProductRepository } from "../domain/ports/product.repository.js";
import { planProPricePrefill } from "../domain/services/pro-price-prefill.js";

/** Le plan, et les agrégats qu'il décrit — l'`apply` écrit sur CEUX-LÀ. */
export interface PrefillPlan {
  readonly policy: ProPricePolicy;
  readonly products: readonly Product[];
  readonly rows: readonly ProPricePrefillRowView[];
}

/**
 * Le chargement commun à l'aperçu et à l'`apply` (lot P, P5) : un seul
 * chemin, pour que ce qu'on montre et ce qu'on écrit soient calculés pareil.
 *
 * Les taux sont ceux de la projection (`CatalogueReader.vatPercents`, la
 * lecture de `feed-projection.service.ts`), sur l'instantané RÉSOLU.
 *
 * @throws {AccountingRulesNotSetError} aucun rapport n'a jamais été posé :
 *   le ratio n'a rien à pré-remplir.
 */
export async function loadPrefillPlan(
  products: ProductRepository,
  catalogue: CatalogueReader,
  accounting: AccountingRulesReader,
): Promise<PrefillPlan> {
  const rules = await accounting.read();
  if (rules === null) {
    throw new AccountingRulesNotSetError();
  }
  const all = await products.listAll();
  const snapshots = all.map((product) => product.snapshot());
  const vat = await catalogue.vatPercents(snapshots);
  const policy = rules.rules.policy;
  return { policy, products: all, rows: planProPricePrefill(snapshots, vat, policy) };
}
