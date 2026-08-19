import { Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { AuthConfig } from "./auth.config.js";
import { EMAIL_CLAIM, EMAIL_VERIFIED_CLAIM, readStringClaim } from "./auth0-claims.js";
import type { VerifiedToken } from "./principal.js";

type RemoteKeySet = ReturnType<typeof createRemoteJWKSet>;

/**
 * Vérifie les access tokens Auth0 (RS256) : signature contre le JWKS du tenant,
 * puis `iss` et `aud`. `jose` met le JWKS en cache et gère la rotation des
 * clés — d'où la résolution paresseuse : aucun appel réseau à l'amorçage.
 *
 * La vérification s'arrête à ce que le token PROUVE (`sub`, `scopes`).
 * L'enrichissement (résolution du `User` local + tenancy) est délégué au
 * `CustomerPrincipalResolver` : notre base décide de l'autorisation, pas le token.
 */
@Injectable()
export class AccessTokenVerifier {
  private keySet: RemoteKeySet | undefined;

  constructor(private readonly config: AuthConfig) {}

  async verify(token: string): Promise<VerifiedToken> {
    const { payload } = await jwtVerify(token, this.keys(), {
      issuer: this.config.issuer,
      audience: this.config.audience,
    });
    return toVerifiedToken(payload);
  }

  private keys(): RemoteKeySet {
    this.keySet ??= createRemoteJWKSet(this.config.jwksUri);
    return this.keySet;
  }
}

function toVerifiedToken(payload: JWTPayload): VerifiedToken {
  const subject = payload.sub;
  if (subject === undefined || subject === "") {
    throw new Error("Access token sans claim `sub`.");
  }
  const scope = payload["scope"];
  const scopes = typeof scope === "string" ? scope.split(" ").filter((entry) => entry !== "") : [];
  // Absent = provisioning JIT avec e-mail vide (renseigné plus tard via le profil).
  const email = readStringClaim(payload, EMAIL_CLAIM);
  const verified = payload[EMAIL_VERIFIED_CLAIM];
  // `exactOptionalPropertyTypes` : un claim absent ne devient pas une propriété
  // à `undefined`, sinon « on ne sait pas » se lirait comme « non ».
  return {
    subject,
    scopes,
    ...(email === undefined ? {} : { email }),
    ...(typeof verified === "boolean" ? { emailVerified: verified } : {}),
  };
}
