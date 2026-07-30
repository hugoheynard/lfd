import { Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../infra/config/app-config.js";
import { IdentityProviderUnavailableError } from "../domain/errors/account-errors.js";
import { CustomerIdentityPort } from "../domain/ports/customer-identity.port.js";

/** Marge de sécurité avant expiration du jeton M2M, pour ne pas l'utiliser à la seconde près. */
const TOKEN_EXPIRY_MARGIN_SECONDS = 60;

/**
 * Adaptateur **Management API Auth0** du port d'identité.
 *
 * Deux étapes : obtenir un jeton `client_credentials` (mis en cache jusqu'à son
 * expiration — un aller-retour par changement d'e-mail serait du gâchis), puis
 * `PATCH /api/v2/users/{sub}`.
 *
 * Le nouvel e-mail repart **non vérifié**, avec un e-mail de vérification
 * déclenché par Auth0 : sans cela, n'importe qui pourrait s'attribuer une adresse
 * qu'il ne contrôle pas, et l'e-mail est ici un facteur d'authentification.
 *
 * ⚠️ **Prérequis côté tenant** (à faire une fois, dans le dashboard) : une
 * application **Machine to Machine** autorisée sur l'API
 * `https://<domain>/api/v2/` avec les scopes `read:users` et `update:users`, dont
 * l'id et le secret alimentent `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET`.
 * Sans cela le reste de l'API fonctionne normalement, seul le changement d'e-mail
 * est refusé — explicitement, cf. `assertConfigured`.
 */
@Injectable()
export class Auth0CustomerIdentity extends CustomerIdentityPort {
  private readonly logger = new Logger(Auth0CustomerIdentity.name);
  private cachedToken: { value: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: AppConfig) {
    super();
  }

  async changeEmail(subject: string, email: string): Promise<void> {
    const token = await this.managementToken();
    const response = await fetch(
      `https://${this.config.auth0Domain()}/api/v2/users/${encodeURIComponent(subject)}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, email_verified: false, verify_email: true }),
      },
    );

    if (!response.ok) {
      // Le corps de réponse Auth0 peut contenir des détails de tenant : on le
      // trace, on ne le renvoie pas au client.
      this.logger.error(
        `PATCH users a échoué (${String(response.status)}) : ${await response.text()}`,
      );
      throw new IdentityProviderUnavailableError(
        "La mise à jour de l'adresse e-mail auprès du fournisseur d'identité a échoué.",
      );
    }
  }

  /** Jeton M2M valide, depuis le cache ou fraîchement demandé. */
  private async managementToken(): Promise<string> {
    const credentials = this.assertConfigured();

    const cached = this.cachedToken;
    if (cached !== null && cached.expiresAtMs > Date.now()) {
      return cached.value;
    }

    const domain = this.config.auth0Domain();
    const response = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        audience: `https://${domain}/api/v2/`,
      }),
    });

    if (!response.ok) {
      this.logger.error(`Jeton M2M refusé (${String(response.status)})`);
      throw new IdentityProviderUnavailableError(
        "Impossible d'obtenir un jeton auprès du fournisseur d'identité.",
      );
    }

    const payload = parseTokenPayload(await response.json());
    this.cachedToken = {
      value: payload.accessToken,
      expiresAtMs: Date.now() + (payload.expiresInSeconds - TOKEN_EXPIRY_MARGIN_SECONDS) * 1000,
    };
    return payload.accessToken;
  }

  /**
   * Refuse **clairement** plutôt que d'échouer sur un `401` obscur quand le canal
   * n'est pas configuré : le message dit quoi créer.
   */
  private assertConfigured(): { clientId: string; clientSecret: string } {
    const credentials = this.config.auth0ManagementCredentials();
    if (credentials === null) {
      throw new IdentityProviderUnavailableError(
        "Le changement d'adresse e-mail n'est pas disponible : l'application M2M Auth0 " +
          "(AUTH0_M2M_CLIENT_ID / AUTH0_M2M_CLIENT_SECRET) n'est pas configurée.",
      );
    }
    return credentials;
  }
}

/** Réponse `/oauth/token`, validée : elle vient du réseau, donc de `unknown`. */
function parseTokenPayload(raw: unknown): { accessToken: string; expiresInSeconds: number } {
  if (typeof raw !== "object" || raw === null) {
    throw new IdentityProviderUnavailableError("Réponse de jeton illisible.");
  }
  const record: Record<string, unknown> = { ...raw };
  const accessToken = record["access_token"];
  const expiresIn = record["expires_in"];

  if (typeof accessToken !== "string" || accessToken === "" || typeof expiresIn !== "number") {
    throw new IdentityProviderUnavailableError("Réponse de jeton inattendue.");
  }
  return { accessToken, expiresInSeconds: expiresIn };
}
