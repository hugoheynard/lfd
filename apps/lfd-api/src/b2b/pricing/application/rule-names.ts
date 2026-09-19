import type { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import type { PriceRule } from "../domain/price-rule.js";
import type { PricedCompanyNamer } from "../domain/ports/priced-company-namer.js";
import type { RuleNames } from "../domain/pricing-act.js";
import { scopeNameOf } from "./scope-names.js";

/**
 * **Les noms du moment** qu'un acte sur une règle fige : ce qu'elle vise
 * (`scopeNameOf`) et QUI elle vise — la société d'une audience `company`
 * (plan des phrases du journal, lot B, D5, 2026-09-19).
 *
 * Un segment n'a pas d'autre nom que son code, et « tous clients » n'en a pas
 * besoin : seule une société se nomme. Une société que l'annuaire ne connaît
 * pas rend `null`, et la phrase garde alors son identifiant plutôt qu'un nom
 * inventé.
 */
export async function ruleNamesOf(
  rule: PriceRule,
  catalog: ProductCatalogReader,
  companies: PricedCompanyNamer,
): Promise<RuleNames> {
  const { audience } = rule;
  const [scopeName, audienceName] = await Promise.all([
    scopeNameOf(rule.scope, catalog),
    audience.type === "company" && audience.id !== null
      ? companies.nameOf(audience.id)
      : Promise.resolve(null),
  ]);
  return { scopeName, audienceName };
}
