import type { ContactPhonePayload } from "@lfd/contracts";

/** Créer un numéro de contact. Rend l'id du numéro créé. */
export class CreateContactPhoneCommand {
  constructor(readonly payload: ContactPhonePayload) {}
}
