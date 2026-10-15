import type { AccountingRulesReader } from "../../../accounting-rules/domain/ports/accounting-rules.reader.js";
import type { ActiveSalesContextsReader } from "../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import type { CompletenessRules } from "../domain/services/variant-completeness.js";

/**
 * **Lit ce que la règle de complétude ne voit pas d'une fiche** : les
 * contextes en service et la règle du prix pro en vigueur (lot 2b de
 * `plan-catalogue-synchronise-par-audience.md`).
 *
 * Une seule lecture pour l'activation, l'aperçu de bascule et les faits du
 * catalogue : trois lectures écrites chacune de son côté finiraient par juger
 * la même fiche de deux façons. Rien de réglé au prix pro = `null`, jamais un
 * rapport inventé.
 */
export async function readCompletenessRules(
  contexts: ActiveSalesContextsReader,
  accounting: AccountingRulesReader,
): Promise<CompletenessRules> {
  const [active, rules] = await Promise.all([contexts.active(), accounting.read()]);
  return {
    activeContextKeys: active.map((context) => context.key),
    policy: rules?.rules.policy ?? null,
  };
}
