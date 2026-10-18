import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un lot vide : la boutique n'envoie rien quand elle n'a rien observé. */
export class EmptyAudienceBatchError extends DomainError {
  constructor() {
    super(
      "recommendations.audience.empty_batch",
      "Le lot de mesures d'audience est vide : n'envoyer un lot que lorsqu'au moins un geste a été observé.",
    );
  }
}

/** Un lot au-delà de la borne : refusé entier, rien n'est compté. */
export class AudienceBatchTooLargeError extends DomainError {
  constructor(size: number, max: number) {
    super(
      "recommendations.audience.batch_too_large",
      `Le lot porte ${size} mesures d'audience, ${max} au plus : envoyer plus souvent, par lots plus petits.`,
    );
  }
}

/** Un geste que la mesure ne connaît pas. */
export class UnknownAudienceEventError extends DomainError {
  constructor(event: string) {
    super(
      "recommendations.audience.unknown_event",
      `Le geste « ${event} » n'est pas une mesure d'audience connue : rien n'a été compté.`,
    );
  }
}

/**
 * Un emplacement incohérent avec le geste : une vue ou un ajout hors suggestion
 * n'en a pas, une suggestion en a toujours un.
 */
export class AudiencePlacementMismatchError extends DomainError {
  constructor(event: string, placement: string) {
    super(
      "recommendations.audience.placement_mismatch",
      `Le geste « ${event} » ne va pas avec l'emplacement « ${placement} » : une suggestion nomme son emplacement, une vue ou un ajout direct n'en a pas.`,
    );
  }
}

/** Un emplacement mal formé : minuscules, chiffres et `_`, comme une valeur de donnée. */
export class InvalidAudiencePlacementError extends DomainError {
  constructor(placement: string) {
    super(
      "recommendations.audience.invalid_placement",
      `L'emplacement « ${placement} » n'est pas une valeur admise (minuscules, chiffres et « _ », 32 caractères au plus).`,
    );
  }
}

/** Un SKU que le catalogue ne sert à personne : on ne compte pas ce qu'on ne vend pas. */
export class UnknownAudienceSkuError extends DomainError {
  constructor(skus: readonly string[]) {
    super(
      "recommendations.audience.unknown_sku",
      `Article inconnu du catalogue servi : ${skus.join(", ")}. Le lot est refusé entier ; recharger le catalogue de la boutique.`,
    );
  }
}

/** Une période relue à l'envers. */
export class InvalidAudiencePeriodError extends DomainError {
  constructor(from: string, to: string) {
    super(
      "recommendations.audience.invalid_period",
      `La période du ${from} au ${to} est à l'envers : le premier jour doit précéder ou égaler le dernier.`,
    );
  }
}
