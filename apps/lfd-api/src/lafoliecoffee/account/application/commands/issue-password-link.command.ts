/**
 * Fabrique un lien de mot de passe **frais** pour une personne en attente, et
 * renouvelle l'invitation d'UNE société (§8.1 bis, point 4, 2026-10-10).
 *
 * `companyId` nul : celle que la file des accès en attente affiche — sa plus
 * récente invitation non acceptée. C'est ce que rendent les deux écrans tant
 * qu'ils n'envoient pas la société.
 */
export class IssuePasswordLinkCommand {
  constructor(
    readonly userId: string,
    readonly companyId: string | null = null,
  ) {}
}
