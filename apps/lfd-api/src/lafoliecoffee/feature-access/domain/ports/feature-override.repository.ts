import type { FeatureOverride } from "../feature-override.js";

/**
 * Port d'**écriture** des dérogations.
 *
 * Deux gestes, chacun sur une ligne entière — jamais une colonne ciblée : la
 * dérogation est validée par sa factory, et l'adaptateur n'écrit que ce qu'elle
 * a accepté.
 */
export abstract class FeatureOverrideRepository {
  /**
   * Pose la dérogation (création ou remplacement).
   *
   * @returns la valeur qu'elle remplace, ou `null` s'il n'y en avait pas.
   */
  abstract put(override: FeatureOverride): Promise<string | null>;

  /**
   * Supprime la dérogation d'une clé : c'est le retour au défaut.
   *
   * @returns la valeur retirée, ou `null` s'il n'y avait rien à retirer.
   */
  abstract remove(key: string): Promise<string | null>;
}
