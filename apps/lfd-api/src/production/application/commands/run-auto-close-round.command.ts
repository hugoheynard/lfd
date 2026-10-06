/**
 * **Un tour de l'arrêt du plan** — le passage du cron du Worker (plan
 * `documentation/production/plan-arret-du-plan.md`, §3, §4, lot A2). Sans
 * argument : l'heure est celle du `Clock`, le réglage celui de la maison.
 */
export class RunAutoCloseRoundCommand {}

/**
 * Ce que le tour a fait pour le lendemain — la seule observabilité d'un
 * déclenchement machine :
 * - `nothing` : rien à faire (avant l'heure, jour fermé, déjà arrêté, déjà tenté) ;
 * - `alerted` : mode manuel, alerte envoyée (une fois par journée) ;
 * - `closed` | `empty` | `failed` : l'issue de la tentative automatique.
 */
export type AutoCloseRoundTomorrow = "nothing" | "alerted" | "closed" | "empty" | "failed";

export interface AutoCloseRoundReport {
  /** Le lendemain visé, `AAAA-MM-JJ`. */
  readonly tomorrow: string;
  readonly outcome: AutoCloseRoundTomorrow;
  /** Vrai quand le plan d'aujourd'hui n'est pas arrêté et porte des commandes (S4). */
  readonly todayOverdue: boolean;
}
