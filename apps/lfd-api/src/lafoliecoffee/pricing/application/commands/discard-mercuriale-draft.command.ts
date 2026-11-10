/**
 * **Jeter le brouillon d'un client.**
 *
 * Le geste vise un ÉTAT — « plus de brouillon sur ce compte » —, pas la
 * destruction d'une ligne : il est donc silencieux quand il n'y en a pas, et sûr
 * à répéter.
 */
export class DiscardMercurialeDraftCommand {
  constructor(readonly companyId: string) {}
}
