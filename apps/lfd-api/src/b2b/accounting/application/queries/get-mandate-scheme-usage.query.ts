/**
 * Ce qu'une bascule de schéma laisserait derrière elle — lu AVANT de la
 * confirmer : le schéma courant, les actifs par schéma, les brouillons.
 */
export class GetMandateSchemeUsageQuery {
  constructor(readonly legalEntityId: string) {}
}
