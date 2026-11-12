/** Fabrique un lien de mot de passe **frais** pour un invité de l'équipe. */
export class IssueStaffPasswordLinkCommand {
  constructor(
    readonly staffUserId: string,
    /** La fiche du staff qui remet le lien : l'acteur de l'intention. */
    readonly issuedBy: string,
    /** La clé d'intention de l'écran : un double clic ne fabrique pas deux liens. */
    readonly intentKey: string,
  ) {}
}
