import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Une famille du PIM sans rayon dans la boutique.
 *
 * **Technique et non métier** : ce n'est pas le client qui s'est trompé, c'est
 * le référentiel qui a bougé sans que la boutique suive. Le rayon est une union
 * fermée dans les contrats — une famille inédite exige un déploiement, pas une
 * devinette.
 *
 * Lever plutôt que ranger par défaut : un rayon faux ferait appliquer à
 * l'article les règles de prix d'une AUTRE famille, et rien ne le signalerait
 * avant la facture.
 */
export class UnknownCatalogShelfError extends TechnicalError {
  constructor(
    readonly sku: string,
    readonly categoryId: string,
  ) {
    super(
      "catalog.shelf.unknown",
      `L'article « ${sku} » vient d'une famille inconnue de la boutique (« ${categoryId} ») : aucun rayon ne lui correspond.`,
    );
  }
}
