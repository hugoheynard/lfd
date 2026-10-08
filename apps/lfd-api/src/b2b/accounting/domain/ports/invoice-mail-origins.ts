/**
 * L'origine de la boutique, réduite à ce qu'en fait l'e-mail « Votre
 * facture » : un lien vers « Mes factures ». Port étroit, comme
 * `OrderMailOrigins` : l'abonné ne dépend pas de toute la configuration.
 *
 * `null` = origine non configurée : l'e-mail omet le bouton plutôt que de
 * poser un lien relatif, inerte dans une boîte mail.
 */
export abstract class InvoiceMailOrigins {
  abstract clientBaseUrl(): string | null;
}
