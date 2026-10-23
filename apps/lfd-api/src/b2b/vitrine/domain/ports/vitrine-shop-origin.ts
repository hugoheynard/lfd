/**
 * L'origine de la boutique, réduite à ce qu'en fait le flux de la vitrine :
 * l'adresse absolue d'une fiche (`URLProduct`). Port étroit, comme
 * `InvoiceMailOrigins` : le flux ne dépend pas de toute la configuration.
 *
 * `null` = origine non configurée : l'adresse est servie vide plutôt
 * qu'inventée — une adresse relative ne mène nulle part chez l'agence.
 */
export abstract class VitrineShopOrigin {
  abstract clientBaseUrl(): string | null;
}
