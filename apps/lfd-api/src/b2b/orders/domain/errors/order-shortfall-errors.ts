import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un manque signalé sans aucune ligne : le fait du colisage est vide. */
export class EmptyShortfallError extends DomainError {
  constructor(reference: string) {
    super(
      "orders.shortfall.empty",
      `Le manque signalé sur ${reference} ne porte aucune ligne : rien n'a été enregistré. Signalez-le de nouveau depuis le poste de colisage.`,
    );
  }
}

/** « Décider du départ » sans manque en vigueur : rien n'attend de décision. */
export class NoShortfallToDecideError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall.nothing_to_decide",
      `Aucun manque n'est signalé sur ${reference} : il n'y a pas de départ incomplet à décider. Si des pièces manquent, signalez-le d'abord depuis le poste de colisage.`,
    );
  }
}
