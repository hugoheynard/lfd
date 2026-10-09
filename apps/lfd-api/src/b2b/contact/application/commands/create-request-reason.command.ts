import type { RequestReasonPayload } from "@lfd/contracts";

/** Créer un motif dans l'onglet d'un formulaire. Rend l'id du motif créé. */
export class CreateRequestReasonCommand {
  constructor(readonly payload: RequestReasonPayload) {}
}
