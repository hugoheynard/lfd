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

/**
 * Ce que le rangement n'a pas pu dire, pour que l'écran le montre au lieu de
 * revenir en silence au filtre par famille :
 * - `unread` : la route du rangement n'a pas répondu, le filtre est par
 *   famille — juste en mode boutique, faux en mode prod ;
 * - `workstations` : le mode prod n'a pas pu lire ses postes, le serveur a
 *   rangé par rayon et les puces sont des rayons.
 */
export type GroupingLoss = 'unread' | 'workstations';

/** Le filtre lu, et ce que sa lecture a perdu (`null` : rien). */
export interface WorkstationFilterRead {
  readonly filter: WorkstationFilter | null;
  readonly loss: GroupingLoss | null;
}

/** Le texte de l'échec partiel : ce qui se passe, et ce qu'on voit. */
export const GROUPING_LOSS_TEXT: Readonly<Record<GroupingLoss, string>> = {
  unread:
    "Le rangement du fournil n'a pas pu être lu — le filtre est par famille. Si l'atelier est rangé par poste, ses puces ne suivent pas les fiches de poste. Rechargez pour les retrouver.",
  workstations:
    "Les postes n'ont pas pu être lus — le filtre est par rayon, pas par poste. Rechargez pour les retrouver.",
};

/**
 * Lit le rangement de ces SKU et en tire le filtre. Une liste vide ne lit
 * rien ; une lecture ratée ne lève pas, elle se dit dans `loss`.
 */
export async function readWorkstationFilter(
  grouping: (skus: readonly string[]) => Promise<ProductionGroupingView>,
  skus: readonly string[],
): Promise<WorkstationFilterRead> {
  if (skus.length === 0) {
    return { filter: null, loss: null };
  }
  try {
    const served = await grouping(skus);
    const lost = served.mode === 'workstation' && !served.workstationsKnown;
    return { filter: workstationFilterOf(served), loss: lost ? 'workstations' : null };
  } catch {
    return { filter: null, loss: 'unread' };
  }
}
