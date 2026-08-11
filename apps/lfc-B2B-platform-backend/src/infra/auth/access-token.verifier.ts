import { Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { AuthConfig } from "./auth.config.js";
import type { VerifiedToken } from "./principal.js";

type RemoteKeySet = ReturnType<typeof createRemoteJWKSet>;

/**
 * Vérifie les access tokens Auth0 (RS256) : signature contre le JWKS du tenant,
 * puis `iss` et `aud`. `jose` met le JWKS en cache et gère la rotation des
 * clés — d'où la résolution paresseuse : aucun appel réseau à l'amorçage.
 *
 * La vérification s'arrête à ce que le token PROUVE (`sub`, `scopes`).
 * L'enrichissement (résolution du `User` local + tenancy) est délégué au
 * `CustomerUserResolver` : notre base décide de l'autorisation, pas le token.
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

/**
 * Claim **namespacé** portant l'e-mail (Auth0 strippe les claims non namespacés
 * des access tokens). À alimenter côté Auth0 par une Action :
 * `api.accessToken.setCustomClaim("https://lafoliedouce.eu/email", event.user.email)`.
 * Absent = provisioning JIT avec e-mail vide (renseigné plus tard via le profil).
 */
const EMAIL_CLAIM = "https://lafoliedouce.eu/email";

/**
 * Claim **namespacé** disant si l'adresse a été prouvée — même Action Auth0 :
 * `api.accessToken.setCustomClaim("https://lafoliedouce.eu/email_verified", event.user.email_verified)`.
 *
 * Absent = le token n'en dit rien, et on ne recopie rien. C'est la différence
 * entre « pas encore vérifié » et « on ne sait pas » : seule la seconde autorise
 * à laisser la base telle quelle.
 */
const EMAIL_VERIFIED_CLAIM = "https://lafoliedouce.eu/email_verified";

function toVerifiedToken(payload: JWTPayload): VerifiedToken {
  const subject = payload.sub;
  if (subject === undefined || subject === "") {
    throw new Error("Access token sans claim `sub`.");
  }
  const scope = payload["scope"];
  const scopes = typeof scope === "string" ? scope.split(" ").filter((entry) => entry !== "") : [];
  const claimed = payload[EMAIL_CLAIM];
  const email = typeof claimed === "string" && claimed !== "" ? claimed : undefined;
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
