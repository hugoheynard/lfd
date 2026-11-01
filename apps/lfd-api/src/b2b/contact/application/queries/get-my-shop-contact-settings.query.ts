/**
 * Query : la carte de contact d'un client connecté, celle de son audience
 * **établie** au serveur — pro d'une société active, sinon particulier.
 * `null` : l'espace perso.
 */
export class GetMyShopContactSettingsQuery {
  constructor(readonly companyId: string | null) {}
}
