import { InjectionToken } from '@angular/core';

/**
 * Base de l'API PIM. Le POC front tapait tout dans LocalDb ; l'intégration Shopify
 * réelle est la première à parler au backend (`lfc-PIM-backend`, port 3100 en dev).
 * Surchargeable en prod par un provider — jamais de secret ici, juste une origine.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  factory: () => 'http://localhost:3100',
});
