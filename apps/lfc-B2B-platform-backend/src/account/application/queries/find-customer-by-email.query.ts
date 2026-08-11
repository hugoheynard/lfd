/**
 * Cherche un client par son adresse — avant d'ouvrir un compte à son nom.
 *
 * Le commercial saisit une adresse ; il ne peut pas savoir si cette personne est
 * déjà cliente pour un autre établissement. Sans cette lecture, il créerait un
 * second espace à quelqu'un qui en a déjà un, et deux mots de passe pour une
 * seule boîte e-mail.
 */
export class FindCustomerByEmailQuery {
  constructor(readonly email: string) {}
}
