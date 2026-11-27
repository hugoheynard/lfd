import {
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** On compare une version à une version plus ancienne : l'ordre est inversé. */
export class PlanVersionRangeInvertedError extends DomainError {
  constructor(from: number, to: number) {
    super(
      "production.plan_version.range_inverted",
      `La comparaison part de la version ${from} pour aller à la version ${to}, plus ancienne. ` +
        "Choisissez la version la plus ancienne en premier.",
    );
  }
}

/** Une version demandée, ou une version entre les deux, n'est pas connue de la journée. */
export class PlanVersionNotFoundError extends ResourceNotFoundError {
  constructor(version: number) {
    super(
      "production.plan_version.not_found",
      `La version ${version} du plan n'existe pas pour cette journée. ` +
        "Rechargez la liste des versions et choisissez-en une qu'elle affiche.",
    );
  }
}
