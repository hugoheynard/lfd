import type { CatalogueView } from "../value-objects/nav-preferences.js";

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
  abstract saveCatalogueView(userId: string, view: CatalogueView): Promise<void>;
}
