/**
 * La carte d'un sous-compte, lue depuis son compte principal pour la régler
 * (`carte-des-sites.md`, § 3.2, § 2), ou depuis le site lui-même, en
 * lecture seule.
 */
export class GetSubAccountMenuQuery {
  constructor(
    readonly userId: string,
    readonly subAccountId: string,
  ) {}
}
