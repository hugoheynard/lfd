/**
 * « Que paie CE client, article par article ? » — la lecture de l'onglet
 * « Tarifs » d'une fiche compte.
 *
 * Distincte du tableau général, qui répond à « qu'est-ce qui joue sur ce prix »
 * toutes audiences confondues : dans un dossier client, chaque ligne affirme
 * « voici ce qui s'applique à lui », et une règle d'un tiers y serait un
 * mensonge.
 */
export class ReadCompanyPricingQuery {
  constructor(readonly companyId: string) {}
}
