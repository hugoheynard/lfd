import { z } from "zod";

/**
 * ── Les RÉSULTATS des suggestions décidées ──────────────────────────────────
 *
 * RS6 (`documentation/recommandation-produit/suggestions-du-staff.md`,
 * §8.2) : par règle, sur une période glissante finissant aujourd'hui (jour
 * métier), affichée, cliquée, ajoutée — comptées —, puis commandées et chiffre
 * d'affaires HT — **estimés**.
 *
 * Pourquoi estimés : les compteurs d'audience sont anonymes (jour × article ×
 * geste × emplacement × source), aucun ne nomme un client. Une commande ne se
 * relie donc pas à un clic. L'estimation, jour par jour et article par
 * article : la quantité commandée ce jour-là, **plafonnée** par les ajouts
 * depuis les suggestions ; si plusieurs règles ont fait ajouter le même
 * article le même jour, le plafond se partage entre elles au prorata de leurs
 * ajouts. Le chiffre d'affaires vaut cette quantité au prix HT moyen payé
 * pour l'article ce jour-là.
 *
 * - `GET /admin/suggestions/results?days=7|30|90` → `StaffSuggestionResultsView`
 *   (sous `lfc_suggestions:read` ; 30 jours par défaut)
 */

/** Les périodes que l'écran propose, en jours métier, aujourd'hui compris. */
export const STAFF_SUGGESTION_RESULT_PERIODS = [7, 30, 90] as const;
export type StaffSuggestionResultPeriod = (typeof STAFF_SUGGESTION_RESULT_PERIODS)[number];

/** La période par défaut : un mois glissant. */
export const DEFAULT_STAFF_SUGGESTION_RESULT_PERIOD: StaffSuggestionResultPeriod = 30;

const period = z.coerce
  .number()
  .pipe(z.literal(STAFF_SUGGESTION_RESULT_PERIODS, "période attendue : 7, 30 ou 90 jours"));

/** `GET /admin/suggestions/results?days=` — une des trois périodes, 30 par défaut. */
export const staffSuggestionResultsQuerySchema = z.strictObject({
  days: period.optional(),
});
export type StaffSuggestionResultsQuery = z.infer<typeof staffSuggestionResultsQuerySchema>;

/** Les chiffres d'une règle sur la période. */
export interface StaffSuggestionResultRow {
  readonly ruleId: string;
  /** Comptés par la boutique. */
  readonly shown: number;
  readonly clicked: number;
  readonly added: number;
  /** Pièces commandées attribuées à la règle — ESTIMÉES (cf. l'en-tête). */
  readonly orderedEstimate: number;
  /**
   * Ajoutées ÷ affichées, en points de base (1 % = 100), arrondi à l'entier ;
   * `null` quand la règle n'a pas été affichée — un taux sur zéro n'existe pas.
   */
  readonly addRateBasisPoints: number | null;
  /** Chiffre d'affaires HT apporté, en centimes — ESTIMÉ. */
  readonly revenueEstimateCents: number;
}

export interface StaffSuggestionResultsView {
  readonly days: StaffSuggestionResultPeriod;
  /** Premier et dernier jour métier `AAAA-MM-JJ` de la période, compris. */
  readonly from: string;
  readonly to: string;
  /** Une ligne par règle connue, archivées comprises. */
  readonly rules: readonly StaffSuggestionResultRow[];
}
