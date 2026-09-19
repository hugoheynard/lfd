/** Fabrique un lien de mot de passe **frais** pour un invité de l'équipe. */
export class IssueStaffPasswordLinkCommand {
  constructor(readonly staffUserId: string) {}
}
