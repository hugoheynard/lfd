import { Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../infra/config/app-config.js";
import { IdentityProviderUnavailableError } from "../../shared/errors/identity-errors.js";
import {
  missingManagementScopes,
  scopesFromAccessToken,
  REQUIRED_MANAGEMENT_SCOPES,
} from "./identity-diagnosis.js";

/** Marge avant expiration du jeton M2M, pour ne pas l'utiliser à la seconde près. */
const TOKEN_EXPIRY_MARGIN_SECONDS = 60;

/** De quoi lire un refus d'Auth0 sans recopier une page d'erreur dans une réponse. */
const TOKEN_ERROR_MAX_CHARS = 500;

/** Ce que le contrôle du canal d'identité rapporte — jamais le jeton lui-même. */
export interface IdentityDiagnosis {
  /** Les identifiants M2M sont-ils présents dans l'environnement du container ? */
  readonly configured: boolean;
  /** Le tenant a-t-il accordé un jeton ? */
  readonly tokenGranted: boolean;
  readonly tokenStatus?: number;
  readonly tokenError?: string;
  readonly grantedScopes?: readonly string[];
  /** Vide = le canal peut tout ce que les écrans proposent. */
  readonly missingScopes: readonly string[];
}

/**
 * Le **transport** vers la Management API Auth0 : obtenir un jeton M2M, le
 * garder, et faire des appels avec.
 *
 * Extrait de l'adaptateur d'identité parce que ce sont deux métiers : ici on ne
 * sait rien des utilisateurs ni des mots de passe, seulement qu'il existe une
 * API HTTP derrière un jeton. L'adaptateur, lui, ne sait rien du jeton.
 *
 * ⚠️ **Prérequis côté tenant** (une fois, dans le dashboard) : une application
 * **Machine to Machine** autorisée sur `https://<domain>/api/v2/` avec les scopes
 * `read:users`, `create:users`, `update:users` — et `create:user_tickets` pour
 * les liens de mot de passe. Sans cela, seules ces opérations sont refusées,
 * explicitement ; le reste de l'API fonctionne.
 */
@Injectable()
export class Auth0ManagementClient {
  private readonly logger = new Logger(Auth0ManagementClient.name);
  private cachedToken: { value: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: AppConfig) {}

  /**
   * Appelle la Management API et rend le corps de réponse tel quel (`unknown` —
   * il vient du réseau, l'appelant le valide).
   *
   * Un `409` rend la sentinelle `CONFLICT` au lieu de lever : « cette adresse
   * existe déjà » est une réponse utile, pas une panne, et l'appelant en fait
   * quelque chose d'utile (réutiliser l'identité plutôt qu'en créer une seconde).
   *
   * Un `404` rend `NOT_FOUND`, pour la même raison : « je ne connais pas cette
   * identité » est un **fait**, pas un incident. Seules les routes portant un
   * `user_id` peuvent le produire ici, et c'est justement là qu'il faut le
   * distinguer d'une panne — un sujet périmé se rattrape par l'e-mail, une
   * panne non.
   */
  async call(
    method: string,
    path: string,
    body?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const token = await this.token();
    const response = await fetch(`https://${this.config.auth0Domain()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (response.status === 409) {
      return CONFLICT;
    }
    if (response.status === 404) {
      return NOT_FOUND;
    }
    if (!response.ok) {
      // Le corps Auth0 peut porter des détails de tenant : il est TRACÉ, jamais
      // renvoyé au client.
      this.logger.error(
        `${method} ${path} a échoué (${String(response.status)}) : ${await response.text()}`,
      );
      throw new IdentityProviderUnavailableError("Le fournisseur d'identité a refusé l'opération.");
    }
    return response.status === 204 ? null : await response.json();
  }

  /**
   * **Le contrôle de mise en service du canal d'identité** : le tenant nous
   * répond-il, et ce qu'il nous répond ouvre-t-il les gestes que les écrans
   * proposent déjà ?
   *
   * Strictement en LECTURE — il échange un jeton et lit ce que ce jeton ouvre.
   * Rien n'est créé chez le fournisseur, donc il peut tourner à chaque
   * déploiement sans laisser de compte fantôme derrière lui.
   *
   * Il existe parce que la panne du 2026-08-16 ne se laissait pas provoquer :
   * un `500` sur l'ouverture d'un accès, aucune trace côté Auth0, des journaux
   * de container qui n'arrivaient nulle part — puis plus rien à reproduire. Un
   * canal doit pouvoir **prouver qu'il fonctionne** sans qu'on ait à attendre
   * qu'il casse.
   *
   * Le jeton ne sort jamais d'ici : on ne publie que ce qu'il ouvre.
   */
  async diagnose(): Promise<IdentityDiagnosis> {
    const credentials = this.config.auth0ManagementCredentials();
    if (credentials === null) {
      return { configured: false, tokenGranted: false, missingScopes: REQUIRED_MANAGEMENT_SCOPES };
    }

    const response = await this.requestToken(credentials);
    if (!response.ok) {
      // Le corps d'Auth0 est la seule chose qui distingue « mauvais secret »
      // d'« application désactivée ». Il ne porte aucune donnée personnelle, et
      // la route est derrière le jeton d'exploitation : il sort.
      return {
        configured: true,
        tokenGranted: false,
        tokenStatus: response.status,
        tokenError: (await response.text()).slice(0, TOKEN_ERROR_MAX_CHARS),
        missingScopes: REQUIRED_MANAGEMENT_SCOPES,
      };
    }

    const granted = scopesFromAccessToken(parseTokenPayload(await response.json()).accessToken);
    return {
      configured: true,
      tokenGranted: true,
      grantedScopes: granted,
      missingScopes: missingManagementScopes(granted),
    };
  }

  /** Jeton M2M valide, depuis le cache ou fraîchement demandé. */
  private async token(): Promise<string> {
    const credentials = this.assertConfigured();

    const cached = this.cachedToken;
    if (cached !== null && cached.expiresAtMs > Date.now()) {
      return cached.value;
    }

    const response = await this.requestToken(credentials);

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

  /** L'échange `client_credentials`, brut — l'appelant décide quoi faire du refus. */
  private async requestToken(credentials: {
    clientId: string;
    clientSecret: string;
  }): Promise<Response> {
    const domain = this.config.auth0Domain();
    return await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        audience: `https://${domain}/api/v2/`,
      }),
    });
  }

  /**
   * Refuse **clairement** plutôt que d'échouer sur un `401` obscur quand le canal
   * n'est pas configuré : le message dit quoi créer.
   */
  private assertConfigured(): { clientId: string; clientSecret: string } {
    const credentials = this.config.auth0ManagementCredentials();
    if (credentials === null) {
      throw new IdentityProviderUnavailableError(
        "Cette opération demande la Management API Auth0 : l'application M2M " +
          "(AUTH0_M2M_CLIENT_ID / AUTH0_M2M_CLIENT_SECRET) n'est pas configurée.",
      );
    }
    return credentials;
  }
}

/** Sentinelle de `409` — une valeur, pas une exception : le conflit est une réponse. */
export const CONFLICT = Symbol("auth0.conflict");

/** Sentinelle de `404` — l'identité visée n'existe pas chez le fournisseur. */
export const NOT_FOUND = Symbol("auth0.not_found");

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
