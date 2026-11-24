/**
 * L'origine de la boutique, réduite à ce qu'en fait l'annonce des nouvelles
 * CGV : un lien vers « Mes paniers récurrents ». Port étroit, comme
 * `InvoiceMailOrigins` : l'abonné ne dépend pas de toute la configuration.
 *
 * `null` = origine non configurée : l'e-mail omet le bouton plutôt que de
 * poser un lien relatif, inerte dans une boîte mail.
 */
export abstract class BasketMailOrigins {
  abstract clientBaseUrl(): string | null;
}
