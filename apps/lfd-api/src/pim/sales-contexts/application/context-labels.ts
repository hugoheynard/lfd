import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";

/**
 * **Les libellés du moment des contextes qu'un fait cite par leur clé** — la
 * table `contextLabels` des charges du journal (D5 du plan des phrases, lot D,
 * 2026-09-19).
 *
 * Une clé de contexte est ce qu'un record de charge emploie (`vatByContext`,
 * `blast.families`) ; seule, elle ne dit rien d'un contexte créé à l'écran
 * (`brunch`), et le libellé d'aujourd'hui mentirait sur une ligne d'hier. On le
 * fige donc à l'écriture.
 *
 * Lu sur **tous** les contextes, hors service compris : un taux effacé peut
 * citer un contexte désactivé depuis. Une clé que le registre ne connaît pas
 * est **omise**, pas refusée : le fait ne se perd pas pour un libellé (D2), et
 * l'écran retombe sur la clé plutôt que sur un nom inventé.
 */
export async function contextLabelsOf(
  contexts: SalesContextRegistry,
  keys: Iterable<string>,
): Promise<Readonly<Record<string, string>>> {
  const cited = new Set(keys);
  if (cited.size === 0) {
    return {};
  }
  const all = await contexts.all();
  return Object.fromEntries(
    all
      .filter((context) => cited.has(context.key) && context.label.length > 0)
      .map((context) => [context.key, context.label] as const),
  );
}
