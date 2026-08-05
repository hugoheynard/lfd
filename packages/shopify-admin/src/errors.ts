/**
 * Erreurs du transport Shopify — **sans dépendance au framework** ni à une app.
 * Chaque erreur porte sa `category` (`business` = refus légitime, `technical` =
 * incident) + un `code` stable. L'app qui consomme le package mappe ces deux
 * champs vers HTTP dans son filtre d'exceptions (le seul endroit qui connaît HTTP).
 */
export type ShopifyErrorCategory = "business" | "technical";

export class ShopifyAdminError extends Error {
  readonly code: string;
  readonly category: ShopifyErrorCategory;

  constructor(code: string, category: ShopifyErrorCategory, message: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.category = category;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/** Le transport vers Shopify a échoué (réseau, HTTP non-2xx, erreurs GraphQL). */
export class ShopifyTransportError extends ShopifyAdminError {
  constructor(message: string, cause?: unknown) {
    super("shopify.transport", "technical", message, cause);
  }
}

/** Shopify a refusé l'opération pour une raison métier (`userErrors`). */
export class ShopifyRejectedError extends ShopifyAdminError {
  constructor(message: string) {
    super("shopify.rejected", "business", message);
  }
}

/** L'intégration est appelée en mode live sans être configurée (domaine ou jeton). */
export class ShopifyNotConfiguredError extends ShopifyAdminError {
  constructor(message: string) {
    super("shopify.not_configured", "business", message);
  }
}
