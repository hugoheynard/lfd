import type { ContactSubjectPayload } from "@lfd/contracts";

/** Créer un objet de « Nous écrire ». Rend l'id de l'objet créé. */
export class CreateContactSubjectCommand {
  constructor(readonly payload: ContactSubjectPayload) {}
}
