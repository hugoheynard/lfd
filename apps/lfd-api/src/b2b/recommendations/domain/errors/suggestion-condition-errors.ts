import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **conditions facultatives** d'une suggestion décidée (RS8,
 * `documentation/recommandation-produit/suggestions-du-staff.md`, §2.1).
 *
 * À part de `staff-suggestion-errors.ts` pour qu'aucun des deux fichiers ne
 * grossisse au-delà de ce qu'on relit d'un trait. Même règle d'écriture : le
 * cas réel, et le geste de sortie.
 */

/** Une liste de jours vide, inconnue ou en double. 400. */
export class InvalidSuggestionWeekdaysError extends DomainError {
  constructor(reason: "empty" | "unknown" | "duplicate", value: string) {
    super(
      "suggestions.weekdays_invalid",
      reason === "empty"
        ? "Les jours de la semaine sont cochés sans aucun jour : en cocher au moins un, ou retirer la condition."
        : reason === "unknown"
          ? `Le jour « ${value} » n'existe pas : cocher les jours dans la liste, du lundi au dimanche.`
          : `Le jour « ${value} » est coché deux fois : ne le cocher qu'une fois.`,
    );
  }
}

/** Une heure mal formée. 400. */
export class InvalidSuggestionHourError extends DomainError {
  constructor(field: string, raw: string) {
    super(
      "suggestions.hour_invalid",
      `${field} « ${raw} » n'est pas une heure (format HH:MM, de 00:00 à 23:59) : la choisir dans le champ.`,
    );
  }
}

/** Une plage d'heures à l'envers, vide, ou qui passerait minuit. 400. */
export class SuggestionHoursReversedError extends DomainError {
  constructor(from: string, to: string) {
    super(
      "suggestions.hours_reversed",
      `La plage horaire finit à ${to} sans finir après son début (${from}) : une plage ne passe pas minuit. Avancer le début, repousser la fin, ou poser deux suggestions (le soir, puis le matin).`,
    );
  }
}

/** Un montant de panier qui n'est pas un nombre entier de centimes positif, ou démesuré. 400. */
export class InvalidSuggestionCartThresholdError extends DomainError {
  constructor(cents: number, maxCents: number) {
    super(
      "suggestions.cart_threshold_invalid",
      `Le montant minimum du panier (${cents} centimes) n'est pas admis : un montant de 0,01 € à ${maxCents / CENTS_PER_EURO} €, ou laisser vide pour aucun seuil.`,
    );
  }
}

/** Une condition sur le panier posée ailleurs qu'au panier. 400. */
export class SuggestionCartConditionPlacementError extends DomainError {
  constructor(condition: "threshold" | "family") {
    super(
      "suggestions.cart_condition_placement",
      `${condition === "threshold" ? "Le montant minimum du panier" : "La condition « le panier n'a aucun article de cette famille »"} ne se juge qu'au panier : choisir l'emplacement « panier », ou retirer la condition.`,
    );
  }
}

/** « Famille au panier » et « sans cette famille » sur la même famille : jamais vrai. 400. */
export class SuggestionFamilyContradictionError extends DomainError {
  constructor(familyId: string) {
    super(
      "suggestions.family_contradiction",
      `La suggestion se déclenche quand la famille ${familyId} est au panier, et ne vaut que si elle n'y est pas : elle ne s'afficherait jamais. Choisir une autre famille dans l'une des deux.`,
    );
  }
}

/** Une liste de points de retrait vide, en double ou démesurée. 400. */
export class InvalidSuggestionSitesError extends DomainError {
  constructor(reason: "empty" | "duplicate" | "too_many", value: string, max: number) {
    super(
      "suggestions.sites_invalid",
      reason === "empty"
        ? "La condition « points de retrait » est posée sans aucun point : en choisir au moins un, ou retirer la condition."
        : reason === "duplicate"
          ? `Le point de retrait ${value} est choisi deux fois : ne le choisir qu'une fois.`
          : `Plus de ${max} points de retrait choisis : retirer la condition, elle vaudra pour tous.`,
    );
  }
}

/** Un point de retrait inconnu, archivé, ou qui ne remet pas. 400. */
export class UnknownSuggestionSiteError extends DomainError {
  constructor(ids: readonly string[]) {
    super(
      "suggestions.site_unknown",
      `Point(s) de retrait inconnu(s), archivé(s) ou qui ne remettent pas : ${ids.join(", ")}. Choisir dans la liste des points de retrait ouverts.`,
    );
  }
}

const CENTS_PER_EURO = 100;
