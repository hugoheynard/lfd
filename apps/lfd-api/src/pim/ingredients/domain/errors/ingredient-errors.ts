import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** L'identité d'un référentiel a une forme : c'est la base qui la cite. */
export class ReferenceKeyInvalidError extends DomainError {
  constructor(what: string, raw: string) {
    super(
      "catalogue.reference.key_invalid",
      `Identité de ${what} invalide : « ${raw} ». Minuscules, chiffres et ` +
        `tirets — c'est une identité, pas un libellé.`,
    );
  }
}

/** Le nom est ce qu'un humain lit : au moins la langue source. */
export class LocalizedNameRequiredError extends DomainError {
  constructor(what: string) {
    super("catalogue.reference.name_required", `Le nom de ${what} est obligatoire.`);
  }
}

/** Deux appellations ne portent pas le même code — les ingrédients le citent. */
export class AppellationCodeTakenError extends BusinessError {
  constructor(code: string) {
    super("catalogue.appellation.code_taken", `Une appellation porte déjà le code « ${code} ».`);
  }
}

/** L'appellation visée n'existe pas (→ 404). */
export class AppellationNotFoundError extends ResourceNotFoundError {
  constructor(code: string) {
    super("catalogue.appellation.not_found", `Appellation introuvable : ${code}.`);
  }
}

/**
 * Des ingrédients la citent : on refuse de l'effacer.
 *
 * Ce n'est pas une prudence de façade. Une appellation est une affirmation
 * réglementée ; l'effacer sous les ingrédients qui la portent laisserait des
 * badges affirmant un signe officiel que plus rien ne définit.
 */
export class AppellationInUseError extends BusinessError {
  constructor(code: string) {
    super(
      "catalogue.appellation.in_use",
      `« ${code} » est encore portée par des ingrédients. Retirez-la d'eux ` +
        `avant de la supprimer — ou mettez-la hors service.`,
    );
  }
}

/** Deux ingrédients ne portent pas la même clé — les fiches la citent. */
export class IngredientKeyTakenError extends BusinessError {
  constructor(key: string) {
    super("catalogue.ingredient.key_taken", `Un ingrédient porte déjà la clé « ${key} ».`);
  }
}

/** L'ingrédient visé n'existe pas (→ 404). */
export class IngredientNotFoundError extends ResourceNotFoundError {
  constructor(key: string) {
    super("catalogue.ingredient.not_found", `Ingrédient introuvable : ${key}.`);
  }
}

/** Des fiches le citent : on refuse de l'effacer. */
export class IngredientInUseError extends BusinessError {
  constructor(key: string) {
    super(
      "catalogue.ingredient.in_use",
      `« ${key} » est encore cité par des fiches. Retirez-le d'elles avant de le supprimer.`,
    );
  }
}
