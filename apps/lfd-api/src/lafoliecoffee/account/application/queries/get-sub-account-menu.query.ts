/**
 * La carte d'un sous-compte, lue depuis son compte principal pour la régler
 * (`plan-carte-des-sites.md`, § 3.2, § 5). Le site lui-même ne la lit pas
 * ici : son rayon la lui montre.
 */
export class GetSubAccountMenuQuery {
  constructor(
    readonly userId: string,
    readonly subAccountId: string,
  ) {}
}
