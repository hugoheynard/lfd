/**
 * **La personne demande à changer son mot de passe**, pour elle-même.
 *
 * Aucun de ces trois champs ne vient du corps de la requête : ils sortent tous
 * du `Principal`, donc de notre base. Un `userId` ou une adresse acceptés en
 * paramètre feraient de cette route un envoyeur de liens de mot de passe à la
 * demande, vers l'adresse de son choix.
 */
export class RequestPasswordResetCommand {
  constructor(
    readonly userId: string,
    /** `sub` du fournisseur — l'identité à qui frapper un ticket. */
    readonly subject: string,
    /** L'adresse du compte, lue en base : la seule destination du lien. */
    readonly email: string,
  ) {}
}
