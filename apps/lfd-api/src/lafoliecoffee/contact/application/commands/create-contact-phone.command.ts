import type { ContactPhonePayload } from "@lfd/contracts";

/** Créer un numéro de contact. Rend l'id du numéro créé. */
export class CreateContactPhoneCommand {
  constructor(
    readonly payload: ContactPhonePayload,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
