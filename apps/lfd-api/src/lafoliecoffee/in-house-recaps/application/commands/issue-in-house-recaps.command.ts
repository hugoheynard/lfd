/** L'issue du passage pour un payeur. */
export type InHouseRecapOutcome =
  | { readonly payerId: string; readonly kind: "issued"; readonly recapId: string }
  | { readonly payerId: string; readonly kind: "empty" }
  | { readonly payerId: string; readonly kind: "already_attempted" }
  | { readonly payerId: string; readonly kind: "failed"; readonly code: string };

/** Ce que le passage rend au cron : le mois, et une issue par payeur vu. */
export interface InHouseRecapsReport {
  readonly month: string;
  readonly outcomes: readonly InHouseRecapOutcome[];
}

/**
 * **Le passage mensuel des récapitulatifs** (`restaurants-maison.md`) :
 * le dernier mois clos à Paris, une issue par payeur maison.
 */
export class IssueInHouseRecapsCommand {}
