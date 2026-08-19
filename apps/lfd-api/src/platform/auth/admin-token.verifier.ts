import { Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { AppConfig } from "../config/app-config.js";
import { AuthConfig } from "./auth.config.js";
import { EMAIL_CLAIM, readStringClaim } from "./auth0-claims.js";
import type { StaffPrincipal } from "./staff-principal.js";

type RemoteKeySet = ReturnType<typeof createRemoteJWKSet>;

/**
 * Vérifie les access tokens **staff** (app admin) : même tenant Auth0 (donc même
 * émetteur et même JWKS que le client), mais une **audience distincte**
 * (`AUTH0_ADMIN_AUDIENCE`) — c'est elle qui sépare la surface staff de la surface
 * client (Invariant C). La vérification s'arrête à ce que le token PROUVE
 * (`sub`, `scopes`).
 *
 * Si l'audience admin n'est pas configurée, la vérification **échoue** (fail
 * closed) : en prod, pas d'audience staff ⇒ aucun token accepté. Le seul chemin
 * qui contourne cette vérification est le bypass de dev, tranché en amont dans
 * `AdminAuthGuard` (jamais en prod).
 */
@Injectable()
export class AdminTokenVerifier {
  private keySet: RemoteKeySet | undefined;

  constructor(
    private readonly authConfig: AuthConfig,
    private readonly appConfig: AppConfig,
  ) {}

  async verify(token: string): Promise<StaffPrincipal> {
    const audience = this.appConfig.auth0AdminAudience();
    if (audience === null) {
      throw new Error("AUTH0_ADMIN_AUDIENCE non configurée : la surface admin refuse tout token.");
    }
    const { payload } = await jwtVerify(token, this.keys(), {
      issuer: this.authConfig.issuer,
      audience,
    });
    return toStaffPrincipal(payload);
  }

  private keys(): RemoteKeySet {
    this.keySet ??= createRemoteJWKSet(this.authConfig.jwksUri);
    return this.keySet;
  }
}

function toStaffPrincipal(payload: JWTPayload): StaffPrincipal {
  const subject = payload.sub;
  if (subject === undefined || subject === "") {
    throw new Error("Access token staff sans claim `sub`.");
  }
  const scope = payload["scope"];
  const scopes = typeof scope === "string" ? scope.split(" ").filter((entry) => entry !== "") : [];
  // L'adresse ne sert qu'au **premier** rapprochement avec l'annuaire ; ensuite
  // c'est le `sub` qui relie, et il ne bouge plus. Un tenant qui ne pose pas ce
  // claim rend le rapprochement impossible — jamais faux.
  //
  // Le claim est **namespacé**, et ce n'est pas négociable : Auth0 retire en
  // silence tout claim nu d'un access token. Lire `payload["email"]` rendrait
  // donc toujours `undefined`, et chaque membre du staff prendrait un `403`
  // inexplicable à sa première connexion.
  return { subject, email: readStringClaim(payload, EMAIL_CLAIM), scopes };
}
