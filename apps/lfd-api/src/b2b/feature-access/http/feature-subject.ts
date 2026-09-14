import type { Principal } from "../../../platform/auth/principal.js";
import type { FeatureSubject } from "../domain/feature-level-resolution.js";

/**
 * **Le seul endroit** où un `Principal` devient le sujet de la résolution.
 *
 * Unique parce que la condition qui compte — l'adresse n'ouvre une exemption
 * que PROUVÉE — tient à ce que `emailProven` soit recopié et jamais deviné.
 * Deux conversions finiraient par différer, et la garde et `GET /feature-access/mine`
 * répondraient deux choses à la même personne.
 *
 * Pas de `Principal` (route `@Public()`, surface admin) = personne : pas
 * d'exemption.
 */
export function featureSubjectOf(principal: Principal | undefined): FeatureSubject {
  if (principal === undefined) {
    return null;
  }
  return { email: principal.email, emailProven: principal.emailProven };
}
