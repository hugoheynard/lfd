import type {
  PurchaseScenarioIssueView,
  PurchaseScenarioSummaryView,
  PurchaseTableFormatRef,
  PurchaseTableVehicleRef,
} from '@lfd/contracts';

/**
 * Les dérivations pures des **scénarios d'achat**
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, B-D5) : de quoi
 * remettre une sélection enregistrée dans les cases du tableau.
 */

/** La clé d'écran d'une référence — celle des choix du tableau (`source:id`). */
export function refKey(ref: PurchaseTableVehicleRef | PurchaseTableFormatRef): string {
  return `${ref.source}:${ref.id}`;
}

/**
 * Les clés à cocher : celles des références que l'écran PROPOSE encore. Un
 * élément archivé ou disparu n'est pas proposé — il est nommé à part, dans
 * les éléments à corriger, et ne part pas au tableau.
 */
export function restoredKeys(
  refs: readonly (PurchaseTableVehicleRef | PurchaseTableFormatRef)[],
  offered: readonly { readonly key: string }[],
): readonly string[] {
  const keys = new Set(offered.map((choice) => choice.key));
  return refs.map(refKey).filter((key) => keys.has(key));
}

/** « 2 véhicules × 3 formats ». */
export function purchaseScenarioSizeLabel(row: PurchaseScenarioSummaryView): string {
  const plural = (n: number, word: string): string => `${String(n)} ${word}${n > 1 ? 's' : ''}`;
  return `${plural(row.vehicles, 'véhicule')} × ${plural(row.formats, 'format')}`;
}

/** La clé d'un élément à corriger, pour le retirer de la liste. */
export function issueKey(issue: PurchaseScenarioIssueView): string {
  return `${issue.source}:${issue.id}`;
}
