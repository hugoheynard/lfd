import type { ContactSettingsPayload } from "@lfd/contracts";

/** Poser la carte de contact de la boutique. Acte **staff** : l'auteur est figé. */
export class UpdateContactSettingsCommand {
  constructor(
    readonly payload: ContactSettingsPayload,
    readonly staffUserId: string,
  ) {}
}
