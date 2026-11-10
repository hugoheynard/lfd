import type { NavPreferencesPatch } from "../value-objects/nav-preferences.js";

/**
 * Port d'**écriture** des préférences de navigation. Volontairement minuscule et
 * séparé du profil (`UserProfileRepository`) : écrire une préférence d'affichage
 * n'a rien à voir avec l'identité de la personne, et un handler qui n'a besoin
 * que de ça ne doit pas dépendre du reste (ISP).
 *
 * La **lecture** vit dans `AccountReader` (déjà relu à l'amorçage `/me`) — pas
 * de méthode `read` ici, un port d'écriture n'a rien à lire.
 *
 * Classe abstraite = aussi le **token d'injection** Nest.
 */
export abstract class NavPreferencesRepository {
  /**
   * Fusionne les clés présentes du patch dans le sac, **en une instruction**.
   *
   * Une lecture suivie d'une écriture perdrait une clé posée entre les deux par
   * un autre appareil (la vue du catalogue d'un côté, l'espace de l'autre) ; un
   * remplacement du sac l'effaçait même sans concurrence — c'était le cas
   * jusqu'au 2026-09-15.
   */
  abstract merge(userId: string, patch: NavPreferencesPatch): Promise<void>;
}
