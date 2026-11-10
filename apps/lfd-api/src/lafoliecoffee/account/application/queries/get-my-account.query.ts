import type { FeatureLevelsSubject } from "../../domain/ports/account-feature-levels.reader.js";

/**
 * Lit le compte de la personne connectée : son profil, ses entreprises, et ses
 * niveaux de fonctionnalités — d'où le sujet (adresse + preuve) à côté de
 * l'identifiant.
 */
export class GetMyAccountQuery {
  constructor(
    readonly userId: string,
    readonly subject: FeatureLevelsSubject,
  ) {}
}
