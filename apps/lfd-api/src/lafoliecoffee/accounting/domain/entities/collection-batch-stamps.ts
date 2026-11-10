/** Un instant et la fiche staff (identifiant LOCAL, jamais un `sub`). */
export interface StaffStamp {
  readonly at: Date;
  readonly staffId: string;
}

/**
 * Qui a préparé le lot : une fiche staff, ou l'automatisme (plan
 * `prelevement-automatique.md`, PA3). Deux formes, pas un identifiant
 * nullable : un lot `system` n'a pas de fiche à joindre à l'annuaire, et un
 * lot `staff` ne peut pas en manquer.
 */
export type ConstitutionAuthor =
  { readonly kind: "staff"; readonly staffId: string } | { readonly kind: "system" };

/** Le rejet du fichier entier par la banque : qui l'a déclaré, quand, pourquoi. */
export interface BankRejectionStamp extends StaffStamp {
  readonly reason: string;
}

/** L'instant de la constitution et son auteur. */
export interface ConstitutionStamp {
  readonly at: Date;
  readonly by: ConstitutionAuthor;
}
