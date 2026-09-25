/**
 * La page d'un rayon, pour la boutique (plan, D8). `shelfKey` : `all`,
 * l'identifiant d'une famille du référentiel, ou `op:<key>`.
 *
 * `companyId` : la société pour laquelle agit un demandeur reconnu, `null`
 * pour un visiteur — la même déduction que le rayon
 * (`shop-catalogue-pricing.service.ts`) : une société ⇒ clientèle `pro`, sinon
 * `public`. Elle décide quelles annonces d'opération s'allument (D7, D11).
 */
export class GetPublicStorefrontPageQuery {
  constructor(
    readonly shelfKey: string,
    readonly companyId: string | null,
  ) {}
}
