import type { CatalogueView } from "../../domain/value-objects/nav-preferences.js";

/**
 * Enregistre la vue de catalogue choisie par la personne connectée.
 *
 * `userId` vient du `Principal` (jamais du corps) : on ne persiste une
 * préférence que pour soi-même.
 */
export class UpdateNavPreferencesCommand {
  constructor(
    readonly userId: string,
    readonly catalogueView: CatalogueView,
  ) {}
}
