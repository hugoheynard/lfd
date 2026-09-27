/**
 * Query **client** : la fidélité de la personne connectée, dans son espace
 * personnel (plan des points, E1.1). Le titulaire vient du principal, jamais
 * d'un corps de requête.
 */
export class GetMyLoyaltyQuery {
  constructor(
    readonly userId: string,
    /** La société de l'espace courant ; non nulle, la fidélité s'y lit fermée (lot F). */
    readonly actingCompanyId: string | null,
  ) {}
}
