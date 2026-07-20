import { Injectable } from '@nestjs/common';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `${name} manquant : voir .env.example (configuration Auth0).`,
    );
  }
  return value;
}

/**
 * Configuration Auth0, lue à l'amorçage. Une auth mal configurée est un risque
 * de sécurité (jetons validés contre le mauvais émetteur) : on échoue tôt et
 * bruyamment plutôt que de démarrer dans un état douteux.
 */
@Injectable()
export class AuthConfig {
  /** Émetteur attendu — `https://<tenant>.<region>.auth0.com/` (slash final inclus). */
  readonly issuer: string;

  /** Audience : l'identifiant de l'API déclarée dans Auth0. */
  readonly audience: string;

  constructor() {
    this.issuer = `https://${requireEnv('AUTH0_DOMAIN')}/`;
    this.audience = requireEnv('AUTH0_AUDIENCE');
  }

  /** Endpoint JWKS public du tenant (clés de signature). */
  get jwksUri(): URL {
    return new URL('.well-known/jwks.json', this.issuer);
  }
}
