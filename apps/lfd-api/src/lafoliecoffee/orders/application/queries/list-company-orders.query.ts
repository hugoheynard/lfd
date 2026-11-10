/**
 * Liste les commandes d'une entreprise — et de ses sites, pour son `owner` ou
 * son `admin` (lot C1 de `plan-commandes-des-sites.md`). `actorUserId`
 * accompagne `companyId` : la lecture est **murée** ; `site` restreint à une
 * société du périmètre, `null` pour tout le périmètre ; `from`/`to` bornent
 * le jour de retrait/livraison, inclus (`plan-recapitulatif-des-commandes.md`,
 * §6.6).
 */
export class ListCompanyOrdersQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly site: string | null = null,
    readonly from: string | null = null,
    readonly to: string | null = null,
  ) {}
}
