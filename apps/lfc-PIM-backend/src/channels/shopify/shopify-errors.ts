import {
  BusinessError,
  TechnicalError,
} from '../../shared/errors/app-error.js';

/** Le transport vers Shopify a échoué (réseau, HTTP non-2xx, erreurs GraphQL). */
export class ShopifyTransportError extends TechnicalError {
  constructor(message: string, cause?: unknown) {
    super('shopify.transport', message, cause);
  }
}

/** Shopify a refusé l'opération pour une raison métier (`userErrors`). */
export class ShopifyRejectedError extends BusinessError {
  constructor(message: string) {
    super('shopify.rejected', message);
  }
}

/** L'intégration est appelée en mode live sans être configurée (domaine ou jeton). */
export class ShopifyNotConfiguredError extends BusinessError {
  constructor(message: string) {
    super('shopify.not_configured', message);
  }
}
