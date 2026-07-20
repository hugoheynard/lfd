import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AuthConfig } from './auth.config.js';
import type { Principal } from './principal.js';

type RemoteKeySet = ReturnType<typeof createRemoteJWKSet>;

/**
 * Vérifie les access tokens Auth0 (RS256) : signature contre le JWKS du tenant,
 * puis `iss` et `aud`. `jose` met le JWKS en cache et gère la rotation des
 * clés — d'où la résolution paresseuse : aucun appel réseau à l'amorçage.
 */
@Injectable()
export class AccessTokenVerifier {
  private keySet: RemoteKeySet | undefined;

  constructor(private readonly config: AuthConfig) {}

  async verify(token: string): Promise<Principal> {
    const { payload } = await jwtVerify(token, this.keys(), {
      issuer: this.config.issuer,
      audience: this.config.audience,
    });
    return toPrincipal(payload);
  }

  private keys(): RemoteKeySet {
    this.keySet ??= createRemoteJWKSet(this.config.jwksUri);
    return this.keySet;
  }
}

function toPrincipal(payload: JWTPayload): Principal {
  const subject = payload.sub;
  if (subject === undefined || subject === '') {
    throw new Error('Access token sans claim `sub`.');
  }
  const scope = payload['scope'];
  const scopes =
    typeof scope === 'string'
      ? scope.split(' ').filter((entry) => entry !== '')
      : [];
  return { subject, scopes };
}
