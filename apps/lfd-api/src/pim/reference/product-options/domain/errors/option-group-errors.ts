import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../../platform/shared/errors/app-error.js";

/** Le groupe d'options visé n'existe pas. */
export class OptionGroupNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "pim.option_group.not_found",
      `Groupe d'options introuvable : ${id}. Rechargez l'écran des options de commande.`,
    );
  }
}

/** Un groupe sans nom ne se retrouve pas dans la liste d'une fiche. */
export class EmptyOptionGroupNameError extends DomainError {
  constructor() {
    super("pim.option_group.empty_name", "Le nom du groupe d'options est obligatoire.");
  }
}

/**
 * Un groupe sans choix en service n'aurait rien à proposer : « sans » est
 * implicite, il ne se déclare pas. Pour retirer le groupe, on l'archive.
 */
export class OptionGroupWithoutChoiceError extends DomainError {
  constructor() {
    super(
      "pim.option_group.no_choice",
      "Un groupe d'options porte au moins un choix en service. Pour ne plus le proposer, archivez le groupe.",
    );
  }
}

/** Deux choix d'un même groupe ne portent pas la même clé : la commande les confondrait. */
export class DuplicateOptionChoiceKeyError extends DomainError {
  constructor(key: string) {
    super(
      "pim.option_group.duplicate_choice_key",
      `Deux choix portent la clé « ${key} » : donnez à chaque choix sa propre clé.`,
    );
  }
}

/**
 * La clé d'un choix est son identité, gardée par les commandes : courte, en
 * minuscules, chiffres et tirets — elle ne se traduit pas et ne change pas.
 */
export class InvalidOptionChoiceKeyError extends DomainError {
  constructor(key: string) {
    super(
      "pim.option_group.invalid_choice_key",
      `La clé « ${key} » n'est pas valide : minuscules sans accent, chiffres et tirets, ` +
        `40 caractères au plus (par exemple « tranche »).`,
    );
  }
}

/** Un choix sans libellé ne se lit pas au client. */
export class EmptyOptionChoiceLabelError extends DomainError {
  constructor(key: string) {
    super("pim.option_group.empty_choice_label", `Le choix « ${key} » n'a pas de libellé.`);
  }
}

/** La clientèle d'un choix : les pros, les particuliers ou les deux. */
export class InvalidOptionChoiceAudienceError extends DomainError {
  constructor(raw: string) {
    super(
      "pim.option_group.invalid_choice_audience",
      `Clientèle inconnue pour un choix d'option : « ${raw} » (attendu : pro, public ou both).`,
    );
  }
}

/**
 * Un groupe archivé ne s'active plus sur une fiche : il ne se propose plus.
 * Le geste de sortie est de le restaurer.
 */
export class OptionGroupArchivedError extends BusinessError {
  constructor(name: string) {
    super(
      "pim.option_group.archived",
      `Le groupe d'options « ${name} » est archivé : restaurez-le depuis l'écran des options ` +
        `de commande avant de l'activer sur une fiche.`,
    );
  }
}
