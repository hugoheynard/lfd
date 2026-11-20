import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Ce qui, dans la fiche existante, répond déjà à la saisie. */
export type TakenContact = "email" | "phone";

/**
 * La fiche à créer au comptoir a l'adresse ou le téléphone d'un particulier
 * déjà inscrit.
 *
 * Jamais de rattachement silencieux : une adresse mal entendue au téléphone
 * rattacherait la commande à quelqu'un d'autre. On nomme donc la personne
 * trouvée (son prénom, jamais son adresse) et le geste de sortie ; l'erreur
 * porte l'identifiant de la fiche pour que l'écran propose de la choisir.
 */
export class ParticularContactTakenError extends BusinessError {
  constructor(
    readonly existingId: string,
    readonly existingFirstName: string,
    readonly taken: TakenContact,
  ) {
    super(
      "account.counter_particular.contact_taken",
      `${taken === "email" ? "Cette adresse e-mail" : "Ce téléphone"} est déjà celui d'une fiche particulier (${existingFirstName === "" ? "prénom non renseigné" : existingFirstName}). Choisissez la fiche existante dans la recherche plutôt que d'en créer une seconde.`,
    );
  }
}

/** La recherche des particuliers est trop courte pour être une recherche. */
export class ParticularSearchTooShortError extends DomainError {
  constructor(readonly minLength: number) {
    super(
      "account.counter_particular.search_too_short",
      `Saisissez au moins ${minLength} caractères (téléphone, prénom ou adresse e-mail) pour chercher un particulier.`,
    );
  }
}
