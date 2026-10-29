import type { OrderLineSnapshot } from "../value-objects/order-line.js";

/**
 * **Les lignes d'avant, sous la référence de l'article qu'elles désignent**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 6, L3) — pur.
 *
 * Une commande passée avant la bascule porte `PAI-001` ; à sa prochaine
 * modification, la demande arrive sous `PAI-001-1` (l'alias d'entrée). Pour
 * que la ligne GARDE son prix figé (R3 du plan de modification) au lieu de
 * repartir au prix du jour, la révision précédente se lit sous la même
 * référence. Si la commande porte déjà les deux graphies, elles fusionnent :
 * quantités additionnées, et le prix, le taux et l'unité de la ligne déjà
 * sous la cible l'emportent — c'est elle que la commande vend désormais.
 *
 * La commande elle-même n'est pas réécrite ici : la révision écrit ses lignes
 * sous la cible, et `changes` trace le passage de l'une à l'autre.
 *
 * @param canonical la référence que chaque graphie désigne (`SaleSkuAliases`).
 */
export function canonicalPreviousLines(
  previous: readonly OrderLineSnapshot[],
  canonical: (sku: string) => string,
): readonly OrderLineSnapshot[] {
  const merged = new Map<string, OrderLineSnapshot>();
  for (const line of previous) {
    const sku = canonical(line.sku);
    const known = merged.get(sku);
    if (known === undefined) {
      merged.set(sku, { ...line, sku });
      continue;
    }
    const lead = line.sku === sku ? line : known;
    merged.set(sku, { ...lead, sku, quantity: known.quantity + line.quantity });
  }
  return [...merged.values()];
}
