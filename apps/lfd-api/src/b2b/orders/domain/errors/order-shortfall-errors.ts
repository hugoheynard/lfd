import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un manque signalé sans aucune ligne : le fait du colisage est vide. */
export class EmptyShortfallError extends DomainError {
  constructor(reference: string) {
    super(
      "orders.shortfall.empty",
      `Le manque signalé sur ${reference} ne porte aucune ligne : rien n'a été enregistré. Signalez-le de nouveau depuis le poste de colisage.`,
    );
  }
}
