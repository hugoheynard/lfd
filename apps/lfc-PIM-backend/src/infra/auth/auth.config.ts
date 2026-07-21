import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';

/**
 * Configuration Auth0 **dérivée** : elle ne lit pas l'environnement (seul
 * `AppConfig` en a le droit), elle construit les valeurs propres à l'auth —
 * l'URL d'émetteur attendue et l'endpoint JWKS — à partir du tenant.
 *
 * Une auth mal configurée est un risque de sécurité (jetons validés contre le
 * mauvais émetteur) : les variables requises échouent déjà au démarrage dans
 * `AppConfig`.
 */
@Injectable()
export class AuthConfig {
  /** Émetteur attendu — `https://<tenant>/` (slash final inclus). */
  readonly issuer: string;

  /** Audience : l'identifiant de l'API déclarée dans Auth0. */
  readonly audience: string;

  constructor(config: AppConfig) {
    this.issuer = `https://${config.auth0Domain()}/`;
    this.audience = config.auth0Audience();
  }

  /** Endpoint JWKS public du tenant (clés de signature). */
  get jwksUri(): URL {
    return new URL('.well-known/jwks.json', this.issuer);
  }
}
