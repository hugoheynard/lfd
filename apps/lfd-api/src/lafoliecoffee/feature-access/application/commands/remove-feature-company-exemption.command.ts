/**
 * Retirer une société de la liste d'exemption d'une clé. La clé n'est pas
 * confrontée au catalogue : c'est ainsi qu'on retire une ligne restée sous
 * une clé disparue.
 */
export class RemoveFeatureCompanyExemptionCommand {
  constructor(
    readonly key: string,
    readonly companyId: string,
  ) {}
}
