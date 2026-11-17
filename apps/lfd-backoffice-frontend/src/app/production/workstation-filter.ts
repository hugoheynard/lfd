import type { ProductionGroupingEntryView, ProductionGroupingView } from '@lfd/contracts';

/**
 * **Le filtre par poste des réassorts du fournil** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.7) : en mode prod, les puces du
 * filtre sont les groupes servis (un poste, ou un rayon « à ranger ») ; en mode
 * boutique, rien ne change — le filtre reste celui de la famille
 * (`categoryId`). Le réassort du COMPTOIR n'est jamais concerné.
 *
 * `null` : mode boutique, ou rangement non lu — le filtre par famille vaut.
 */
export type WorkstationFilter = ReadonlyMap<string, ProductionGroupingEntryView>;

export function workstationFilterOf(
  grouping: ProductionGroupingView | null,
): WorkstationFilter | null {
  if (grouping?.mode !== 'workstation') {
    return null;
  }
  return new Map(grouping.entries.map((entry) => [entry.sku, entry]));
}

/**
 * La clé de filtre d'un article : son groupe servi en mode prod, sa famille
 * sinon. `null` : un SKU que le rangement ne nomme pas — il ne se voit que
 * sous « Tout ».
 */
export function filterKeyOf(
  filter: WorkstationFilter | null,
  sku: string,
  categoryId: string | null,
): string | null {
  return filter === null ? categoryId : (filter.get(sku)?.key ?? null);
}

/** Les puces du mode prod, dans l'ordre des fiches, pour ces SKU. */
export function workstationOptionsOf(
  filter: WorkstationFilter,
  skus: readonly string[],
): readonly { readonly value: string; readonly label: string; readonly order: number }[] {
  const groups = new Map<string, { value: string; label: string; order: number }>();
  for (const sku of skus) {
    const entry = filter.get(sku);
    if (entry !== undefined && !groups.has(entry.key)) {
      groups.set(entry.key, { value: entry.key, label: entry.title, order: entry.order });
    }
  }
  return [...groups.values()].sort((left, right) => left.order - right.order);
}
