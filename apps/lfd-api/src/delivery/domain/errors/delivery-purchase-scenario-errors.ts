import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **scénarios d'achat** (`plan-bibliotheque-d-achat.md`, B-D5,
 * lot B3) — lus par qui compare des achats sans le code sous les yeux :
 * chacun nomme le cas réel et le geste de sortie.
 *
 * Un élément cité archivé ou disparu n'est PAS un refus ici : le scénario
 * s'ouvre quand même et le nomme, pour qu'on le retire.
 */

/** Le nom d'un scénario est vide ou trop long. */
export class InvalidPurchaseScenarioNameError extends DomainError {
  constructor(maxLength: number) {
    super(
      "delivery.purchase_scenario_name_invalid",
      `Le nom du scénario d'achat est requis, et tient en ${maxLength} caractères au plus.`,
    );
  }
}

/** Un autre scénario non archivé porte déjà ce nom. */
export class PurchaseScenarioNameTakenError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.purchase_scenario_name_taken",
      `Un scénario d'achat s'appelle déjà « ${name} » : choisissez un autre nom, ou archivez l'ancien d'abord.`,
    );
  }
}

/** Aucun scénario sous cet identifiant. */
export class PurchaseScenarioNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "delivery.purchase_scenario_not_found",
      `Le scénario d'achat ${id} n'existe pas : rechargez la liste des scénarios.`,
    );
  }
}

/** Remplacer ou archiver un scénario déjà archivé. */
export class PurchaseScenarioAlreadyArchivedError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.purchase_scenario_already_archived",
      `Le scénario d'achat « ${name} » est archivé : réactivez-le d'abord, ou rechargez la liste des scénarios.`,
    );
  }
}

/** Réactiver un scénario qui ne l'est pas. */
export class PurchaseScenarioNotArchivedError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.purchase_scenario_not_archived",
      `Le scénario d'achat « ${name} » est déjà en cours : rechargez la liste des scénarios.`,
    );
  }
}

/**
 * **Un scénario enregistré ne se relit plus** : son contenu ne passe plus la
 * forme de la sélection (une borne resserrée depuis, par exemple). Jamais une
 * 500 : le refus dit pourquoi, et la sortie — le remplacer ou l'archiver.
 */
export class PurchaseScenarioUnreadableError extends BusinessError {
  constructor(name: string, reason: string) {
    super(
      "delivery.purchase_scenario_unreadable",
      `Le scénario d'achat « ${name} » ne se relit plus (${reason}) : remplacez-le depuis l'onglet Tableau, ou archivez-le.`,
    );
  }
}
