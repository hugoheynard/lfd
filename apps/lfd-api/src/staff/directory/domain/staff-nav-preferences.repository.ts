import type { StaffNavPreferencesPatch } from "@lfd/contracts";

/**
 * Port d'**écriture** des préférences de navigation du staff.
 *
 * Séparé de `StaffUserRepository` et volontairement minuscule (ISP) : ranger un
 * réglage d'affichage n'a rien à voir avec l'annuaire, ses dérogations et ses
 * gardes d'auto-rétrogradation. Un handler qui n'écrit qu'une préférence ne doit
 * pas dépendre de tout ça.
 *
 * La **lecture** n'est pas ici : elle vit dans `StaffUserRepository.me()`, qui
 * est déjà relu à l'amorçage — un port d'écriture n'a rien à lire.
 *
 * Classe abstraite = aussi le **token d'injection** Nest.
 */
export abstract class StaffNavPreferencesRepository {
  /**
   * Fusionne `patch` dans le sac de la personne. Une clé absente de la charge
   * reste inchangée en base ; `null` efface le choix.
   *
   * @throws {StaffUserNotFoundError} la fiche n'existe pas.
   */
  abstract merge(staffUserId: string, patch: StaffNavPreferencesPatch): Promise<void>;
}
