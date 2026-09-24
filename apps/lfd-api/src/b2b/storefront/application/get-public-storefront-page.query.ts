/**
 * La page d'un rayon, pour la boutique (plan, D8). `shelfKey` : `all`, ou
 * l'identifiant d'une famille du référentiel.
 */
export class GetPublicStorefrontPageQuery {
  constructor(readonly shelfKey: string) {}
}
