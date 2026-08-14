/** Fabrique un lien de mot de passe **frais** pour une personne en attente. */
export class IssuePasswordLinkCommand {
  constructor(readonly userId: string) {}
}
