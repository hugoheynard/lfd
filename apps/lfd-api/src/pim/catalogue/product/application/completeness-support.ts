import type { ActiveSalesContextsReader } from "../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import type { CompletenessRules } from "../domain/services/variant-completeness.js";

/**
 * **Lit ce que la règle de complétude ne voit pas d'une fiche** : les
 * contextes en service (lot 2b de `plan-catalogue-synchronise-par-audience.md`).
 *
 * Une seule lecture pour l'activation, la liste et les faits du catalogue :
 * trois lectures écrites chacune de son côté finiraient par juger la même
 * fiche de deux façons. La règle du prix pro n'y est plus lue depuis le lot R3
 * (`plan-retirer-le-rapport-pro.md`) : le prix pro est toujours saisi.
 */
export async function readCompletenessRules(
  contexts: ActiveSalesContextsReader,
): Promise<CompletenessRules> {
  const active = await contexts.active();
  return { activeContextKeys: active.map((context) => context.key) };
}
