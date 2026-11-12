/**
 * Command : **chercher les lignes du registre d'une adresse** (lot C4),
 * donnée dans le CORPS. Range l'empreinte et les lignes trouvées, publie
 * `mail.preference_recipient_searched` ; rend l'identifiant de la recherche,
 * à relire par `GetMarketingPreferenceSearchQuery`.
 *
 * `intentKey` : la clé que l'écran a fabriquée pour ce geste — un double clic
 * ne compte qu'une consultation.
 */
export class SearchMarketingPreferencesCommand {
  constructor(
    readonly address: string,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
