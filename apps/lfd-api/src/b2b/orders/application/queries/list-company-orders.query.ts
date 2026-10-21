/**
 * Liste les commandes d'une entreprise — et de ses sites, pour son `owner` ou
 * son `admin` (lot C1 de `plan-commandes-des-sites.md`). `actorUserId`
 * accompagne `companyId` : la lecture est **murée** ; `site` restreint à une
 * société du périmètre, `null` pour tout le périmètre.
 */
export class ListCompanyOrdersQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly site: string | null = null,
  ) {}
}
