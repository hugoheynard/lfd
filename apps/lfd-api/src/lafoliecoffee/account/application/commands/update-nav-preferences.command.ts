import type { NavPreferencesPatch } from "../../domain/value-objects/nav-preferences.js";

/**
 * Change une ou plusieurs préférences de navigation de la personne connectée.
 *
 * `userId` et `companyIds` viennent du `Principal` (jamais du corps) : on ne
 * persiste une préférence que pour soi-même, et l'espace choisi se confronte
 * aux rattachements relus en base, pas à ce que le client en affirme.
 */
export class UpdateNavPreferencesCommand {
  constructor(
    readonly userId: string,
    readonly companyIds: readonly string[],
    readonly patch: NavPreferencesPatch,
  ) {}
}
