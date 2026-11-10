/**
 * Port de **lecture** de la résolution — ce qu'une requête gardée lit, et rien
 * de plus.
 *
 * Deux lectures indexées, **sans cache** (plan §2.1) : un cache laisserait
 * passer des commandes après la fermeture, le temps de sa durée de vie, et
 * survivrait à la remise à zéro des e2e.
 */
export abstract class FeatureLevelLookup {
  /** La valeur brute de la dérogation d'une clé, ou `null` = défaut du code. */
  abstract storedOverride(key: string): Promise<string | null>;

  /**
   * Les dérogations posées parmi ces clés, en UNE lecture — clé → valeur
   * brute ; une clé absente de la carte = défaut du code. Sert la lecture de
   * tous les niveaux d'un coup (`FeatureLevelResolver.levelsFor`).
   */
  abstract storedOverrides(keys: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /** Vrai si cette adresse, déjà normalisée, est exemptée pour cette clé. */
  abstract isExempt(key: string, normalizedEmail: string): Promise<boolean>;
}
