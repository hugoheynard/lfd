/**
 * **Un tour de l'arrêt du plan** — le passage du cron du Worker (plan
 * `documentation/production/arret-du-plan.md`, §3, §4, lot A2). Sans
 * argument : l'heure est celle du `Clock`, l'instant d'arrêt celui de l'heure
 * limite générale (2026-10-21).
 */
export class RunAutoCloseRoundCommand {}

/**
 * Ce que le tour a fait pour une journée — la seule observabilité d'un
 * déclenchement machine :
 * - `nothing` : rien à faire (avant l'heure, aucune heure limite, jour fermé,
 *   déjà arrêté, déjà tenté) ;
 * - `closed` | `empty` | `failed` : l'issue de la tentative automatique ;
 * - `stalled` : une tentative restée `pending` plus de quinze minutes — alerte
 *   envoyée (une fois par journée), pas de retentative (Q8).
 */
export type AutoCloseRoundOutcome = "nothing" | "closed" | "empty" | "failed" | "stalled";

export interface AutoCloseRoundReport {
  /** Le lendemain visé, `AAAA-MM-JJ`. */
  readonly tomorrow: string;
  readonly outcome: AutoCloseRoundOutcome;
  /**
   * Ce que le tour a fait pour AUJOURD'HUI, quand son arrêt tombe aujourd'hui
   * même (heure limite « le jour même », rattrapage qui passe minuit) ;
   * `nothing` sinon.
   */
  readonly todayOutcome: AutoCloseRoundOutcome;
  /**
   * Vrai quand le plan d'aujourd'hui n'est pas arrêté, porte des commandes, et
   * que son arrêt ne tombe pas encore aujourd'hui (S4).
   */
  readonly todayOverdue: boolean;
}
