import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * L'issue d'une tentative automatique :
 * - `pending` : prise, pas encore tranchée (ou le processus est mort entre les deux) ;
 * - `closed` : le plan est arrêté ;
 * - `empty` : aucune commande — « rien à arrêter » a été annoncé ;
 * - `failed` : la clôture a refusé ou cassé — l'alerte est partie.
 */
export type AutoCloseOutcome = "pending" | "closed" | "empty" | "failed";

/**
 * **La trace des tentatives d'arrêt automatique** — une par journée visée,
 * jamais deux (plan `plan-arret-du-plan.md`, B2, lot A2).
 *
 * Sans elle, une journée vide serait re-tentée toutes les cinq minutes, et
 * chaque tentative balaierait les règlements chez Stripe. Avec elle, c'est la
 * base qui décide qui tente : deux instances qui passent ensemble se
 * départagent sur l'insertion, pas sur une lecture.
 */
export abstract class AutoCloseAttempts {
  /**
   * Prend la tentative de cette journée. `false` : une autre l'a déjà prise
   * (ce tour-ci ou un précédent) — ne rien tenter.
   */
  abstract claim(day: ServiceDay, at: Date): Promise<boolean>;

  /** Écrit l'issue. `failure` : le message du refus, seulement en `failed`. */
  abstract settle(
    day: ServiceDay,
    outcome: Exclude<AutoCloseOutcome, "pending">,
    failure: string | null,
    at: Date,
  ): Promise<void>;
}
