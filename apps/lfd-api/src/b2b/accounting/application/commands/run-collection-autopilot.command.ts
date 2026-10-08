import type { SettledAutopilotOutcome } from "../../domain/ports/collection-autopilot-runs.js";

/** Une tentative faite par CE passage. */
export interface AutopilotRunReport {
  readonly legalEntityId: string;
  readonly cycleClosesAt: string;
  readonly outcome: SettledAutopilotOutcome;
}

/**
 * Ce que le passage a tenté — vide quand il n'y avait rien à tenter, ce qui
 * est le cas de presque tous les passages horaires. La seule observabilité
 * d'un cron ; l'écran, lui, lit la table.
 */
export interface CollectionAutopilotReport {
  readonly runs: readonly AutopilotRunReport[];
}

/**
 * **Le passage de la constitution automatique** (plan
 * `documentation/facturation/prelevement-automatique.md`, PA3).
 *
 * Sans charge utile : une passe horaire sur toutes les entités, déclenchée
 * par le Cron Trigger `15 * * * *`. Rejouable à volonté — un cycle n'est
 * tenté qu'une fois par entité.
 */
export class RunCollectionAutopilotCommand {}
