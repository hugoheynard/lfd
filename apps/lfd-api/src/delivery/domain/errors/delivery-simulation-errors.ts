import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **scénarios du simulateur** (lot 9, L9-C7) — lus par qui n'a
 * pas le code sous les yeux : chacun nomme le cas réel et le geste de sortie.
 */

/** Le nom d'un scénario est vide ou trop long. */
export class InvalidSimulationScenarioNameError extends DomainError {
  constructor(maxLength: number) {
    super(
      "delivery.simulation_scenario_name_invalid",
      `Le nom du scénario est requis, et tient en ${maxLength} caractères au plus.`,
    );
  }
}

/** Un autre scénario non archivé porte déjà ce nom. */
export class SimulationScenarioNameTakenError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.simulation_scenario_name_taken",
      `Un scénario s'appelle déjà « ${name} » : choisissez un autre nom, ou archivez l'ancien d'abord.`,
    );
  }
}

/** Aucun scénario vivant sous cet identifiant — inconnu, ou archivé. */
export class SimulationScenarioNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "delivery.simulation_scenario_not_found",
      `Le scénario ${id} n'existe pas ou a été archivé : rechargez la liste des scénarios.`,
    );
  }
}

/** Archiver un scénario qui l'est déjà. */
export class SimulationScenarioAlreadyArchivedError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.simulation_scenario_already_archived",
      `Le scénario « ${name} » est déjà archivé : rechargez la liste des scénarios.`,
    );
  }
}

/**
 * **Un scénario enregistré ne se relit plus** : son contenu ne passe plus la
 * validation du simulateur (une borne resserrée depuis, par exemple). Jamais
 * une 500 : le refus dit pourquoi, et la sortie — l'archiver et le refaire.
 */
export class SimulationScenarioUnreadableError extends BusinessError {
  constructor(name: string, reason: string) {
    super(
      "delivery.simulation_scenario_unreadable",
      `Le scénario « ${name} » ne se relit plus (${reason}) : archivez-le, puis recréez-le depuis l'écran du simulateur.`,
    );
  }
}
