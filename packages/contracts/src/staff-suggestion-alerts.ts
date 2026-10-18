import type { StaffSuggestionReader } from "./staff-suggestions.js";

/**
 * ── Les ALERTES des suggestions décidées ────────────────────────────────────
 *
 * RS10 (`documentation/recommandation-produit/suggestions-du-staff.md`, §13) :
 * une règle qui VIT encore (non archivée, allumée, période en cours ou à
 * venir) et dont un article suggéré ne se vend plus — ou dont le déclencheur
 * nomme un article ou une famille que le catalogue servi ne connaît plus — est
 * signalée dans la liste de l'écran. Calculé à la demande, rien n'est stocké.
 *
 * - `GET /admin/suggestions/alerts` → `StaffSuggestionAlertsView`
 *   (sous `lfc_suggestions:read`)
 */

/**
 * Pourquoi un article suggéré ne se vend plus — des VALEURS, en vocabulaire
 * fermé :
 *
 * - `withdrawn` : retiré du catalogue servi (plus aucune déclinaison en rayon) ;
 * - `not_for_audience` : le catalogue ne le sert pas à cette clientèle (gamme,
 *   validation en attente, étiquette absente) ;
 * - `hidden_for_audience` : masqué par le commerce pour cette clientèle ;
 * - `never_orderable` : servi, mais commandable aucun jour de la période
 *   restante (heure limite, fermeture), bornée à {@link STAFF_SUGGESTION_ALERT_HORIZON_DAYS} jours.
 */
export const STAFF_SUGGESTION_ALERT_REASONS = [
  "withdrawn",
  "not_for_audience",
  "hidden_for_audience",
  "never_orderable",
] as const;
export type StaffSuggestionAlertReason = (typeof STAFF_SUGGESTION_ALERT_REASONS)[number];

/**
 * Pourquoi une CONDITION (RS8) empêche la règle de s'afficher — des VALEURS :
 *
 * - `site_closed` : un point de retrait choisi est archivé ou ne remet plus
 *   (`siteId` le nomme) ; s'ils le sont tous, la règle ne s'affiche plus ;
 * - `no_weekday_left` : aucun des jours de la semaine choisis ne tombe dans
 *   ce qui reste de la période.
 */
export const STAFF_SUGGESTION_CONDITION_ALERT_REASONS = ["site_closed", "no_weekday_left"] as const;
export type StaffSuggestionConditionAlertReason =
  (typeof STAFF_SUGGESTION_CONDITION_ALERT_REASONS)[number];

/** Une condition qui rend la règle impossible, en tout ou en partie. */
export interface StaffSuggestionConditionAlert {
  readonly reason: StaffSuggestionConditionAlertReason;
  /** Avec `site_closed` seulement : le point de retrait. */
  readonly siteId: string | null;
}

/** `empty` : aucun article ne passe, le déclencheur est mort, ou une condition ne peut plus être vraie ; `partial` sinon. */
export const STAFF_SUGGESTION_ALERT_SEVERITIES = ["empty", "partial"] as const;
export type StaffSuggestionAlertSeverity = (typeof STAFF_SUGGESTION_ALERT_SEVERITIES)[number];

/**
 * Jusqu'où l'on cherche un jour commandable : aujourd'hui et les trente jours
 * suivants. Au-delà, une période plus longue n'est pas regardée, et la vue le
 * dit (`window.capped`).
 */
export const STAFF_SUGGESTION_ALERT_HORIZON_DAYS = 31;

/** Un article suggéré qui ne se vend plus, pour une clientèle. */
export interface StaffSuggestionItemAlert {
  readonly sku: string;
  /** `null` pour `withdrawn` : retiré pour tout le monde. */
  readonly audience: StaffSuggestionReader | null;
  readonly reason: StaffSuggestionAlertReason;
}

/** Les jours regardés pour `never_orderable`, `AAAA-MM-JJ`, bornes comprises. */
export interface StaffSuggestionAlertWindow {
  readonly from: string;
  readonly to: string;
  /** La période de la règle va au-delà de l'horizon : elle n'a pas été regardée en entier. */
  readonly capped: boolean;
}

/** Une règle signalée. */
export interface StaffSuggestionRuleAlert {
  readonly ruleId: string;
  readonly severity: StaffSuggestionAlertSeverity;
  /** Le déclencheur nomme un article ou une famille que le catalogue servi ne connaît plus. */
  readonly triggerWithdrawn: boolean;
  readonly items: readonly StaffSuggestionItemAlert[];
  /** Les conditions (RS8) qui l'empêchent de s'afficher ; vide si aucune. */
  readonly conditions: readonly StaffSuggestionConditionAlert[];
  /** `null` quand aucun jour de la période ne tombe dans l'horizon. */
  readonly window: StaffSuggestionAlertWindow | null;
}

export interface StaffSuggestionAlertsView {
  /** Le jour métier du calcul, `AAAA-MM-JJ`. */
  readonly today: string;
  /** Les seules règles signalées ; une règle saine n'y paraît pas. */
  readonly rules: readonly StaffSuggestionRuleAlert[];
}
