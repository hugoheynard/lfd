/**
 * Command : **chercher les envois d'une adresse** (plan
 * `le-suivi-des-e-mails.md`, décision 8). L'adresse vient du CORPS de la
 * requête, jamais d'une URL. Rend l'identifiant de la recherche — un
 * identifiant, pas un modèle de lecture : les résultats se lisent par
 * `GetMailSearchResultsQuery`.
 */
export class SearchMailByRecipientCommand {
  constructor(
    readonly address: string,
    readonly staffUserId: string,
  ) {}
}
