import type { FeatureSubject } from "../../domain/feature-level-resolution.js";

/**
 * Query du client connecté : ses niveaux, exemption appliquée.
 *
 * Porte le sujet (adresse + preuve) et non le `Principal` : la résolution n'a
 * besoin que de ces deux faits.
 */
export class GetMyFeatureLevelsQuery {
  constructor(readonly subject: FeatureSubject) {}
}
