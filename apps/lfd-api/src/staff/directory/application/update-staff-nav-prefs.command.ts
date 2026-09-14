import type { StaffNavPreferencesPatch } from "@lfd/contracts";

/**
 * Enregistre une préférence de navigation de la personne connectée.
 *
 * `staffUserId` vient du jeton, résolu par le guard — jamais du corps ni de
 * l'URL : on n'écrit une préférence que pour soi-même, et un identifiant accepté
 * en paramètre serait une usurpation offerte.
 */
export class UpdateStaffNavPrefsCommand {
  constructor(
    readonly staffUserId: string,
    readonly patch: StaffNavPreferencesPatch,
  ) {}
}
