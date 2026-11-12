import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du compte créancier **aux quatre yeux** : une modification du
 * compte de l'entité n'est prise qu'après la confirmation d'un second membre
 * de la comptabilité, qui ressaisit l'IBAN depuis le RIB de la banque.
 *
 * 🔴 Aucun de ces messages ne porte un IBAN, ni entier ni en partie : un refus
 * se lit à l'écran, se journalise et se recopie dans un ticket.
 */

/**
 * La saisie désignée n'est plus en attente : remplacée par une autre,
 * confirmée ou annulée entre l'ouverture de la fiche et le geste.
 */
export class PendingCreditorAccountGoneError extends BusinessError {
  constructor(readonly pendingId: string) {
    super(
      "accounting.creditor_account.pending_gone",
      "Cette modification du compte bancaire n'est plus en attente : elle a été remplacée " +
        "par une autre saisie, confirmée ou annulée entre-temps. Rechargez la fiche de " +
        "l'entité pour voir la saisie en cours.",
    );
  }
}

/**
 * Le confirmateur est l'auteur de la saisie. Mesuré sur la **fiche** du staff
 * (identifiant interne), pas sur l'identifiant de connexion.
 */
export class CreditorAccountSelfConfirmationError extends BusinessError {
  constructor() {
    super(
      "accounting.creditor_account.self_confirmation",
      "Vous avez saisi cette modification du compte bancaire : elle doit être confirmée par " +
        "un autre membre de la comptabilité. Demandez-lui de ressaisir l'IBAN depuis le RIB " +
        "de la banque.",
    );
  }
}

/**
 * L'IBAN ressaisi n'est pas celui de la saisie en attente. Le message ne dit
 * pas où les deux diffèrent : la confirmation à l'aveugle n'a de valeur que
 * si le second membre recopie le RIB, pas la première saisie.
 */
export class CreditorAccountIbanMismatchError extends BusinessError {
  constructor() {
    super(
      "accounting.creditor_account.iban_mismatch",
      "L'IBAN ressaisi ne correspond pas à celui de la modification en attente. Ressaisissez-le " +
        "depuis le RIB remis par la banque ; s'il diffère vraiment de la saisie, annulez la " +
        "modification et faites-la ressaisir.",
    );
  }
}

/**
 * L'entité a été modifiée par un autre geste entre sa lecture et son
 * écriture : écrire quand même écraserait ce geste.
 */
export class LegalEntityChangedConcurrentlyError extends BusinessError {
  constructor(readonly legalEntityId: string) {
    super(
      "accounting.legal_entity.changed_concurrently",
      "L'entité juridique a été modifiée par quelqu'un d'autre pendant votre saisie : rien n'a " +
        "été enregistré. Rechargez la fiche, vérifiez ce qui a changé, puis refaites votre geste.",
    );
  }
}
