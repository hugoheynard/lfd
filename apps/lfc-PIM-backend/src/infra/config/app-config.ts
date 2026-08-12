import { Injectable } from '@nestjs/common';
import type {
  ShopifyCredentialsSource,
  ShopifyOAuthCredentials,
} from '@lfd/shopify-admin';

// Le type des identifiants Shopify vit dans `@lfd/shopify-admin` (le transport).
// Ré-exporté ici pour les consommateurs historiques de `AppConfig`.
export type { ShopifyOAuthCredentials };

/**
 * Passerelle **unique** vers l'environnement.
 *
 * C'est le seul endroit du backend autorisé à lire `process.env` — la règle
 * ESLint `no-restricted-properties` interdit l'accès direct partout ailleurs.
 * Tout le reste passe par ces méthodes : **typées**, **validées une seule fois
 * au démarrage** (fail-fast plutôt qu'un `undefined` qui se propage), et
 * **substituables en test** via l'injection.
 */
@Injectable()
export class AppConfig implements ShopifyCredentialsSource {
  private readonly database: string;
  private readonly auth0DomainValue: string;
  private readonly auth0AudienceValue: string;
  private readonly portValue: number;
  private readonly shopifyToken: string | null;
  private readonly shopifyClientIdValue: string | null;
  private readonly shopifyClientSecretValue: string | null;
  private readonly production: boolean;

  constructor() {
    this.database = required('DATABASE_URL');
    this.auth0DomainValue = required('AUTH0_DOMAIN');
    this.auth0AudienceValue = required('AUTH0_AUDIENCE');
    this.portValue = optionalPort('PORT', 3100);
    this.shopifyToken = optional('SHOPIFY_ADMIN_TOKEN');
    this.shopifyClientIdValue = optional('SHOPIFY_CLIENT_ID');
    this.shopifyClientSecretValue = optional('SHOPIFY_CLIENT_SECRET');
    this.production = (process.env['NODE_ENV']?.trim() ?? '') === 'production';
  }

  /** Vrai en production (`NODE_ENV=production`). Choisit notamment l'allowlist CORS. */
  isProduction(): boolean {
    return this.production;
  }

  /** URL Postgres (Docker en dev, Neon en prod — ADR-09). */
  databaseUrl(): string {
    return this.database;
  }

  /** Tenant Auth0, sans schéma ni slash — ex. `lfc.eu.auth0.com`. */
  auth0Domain(): string {
    return this.auth0DomainValue;
  }

  /** Identifier de l'API déclarée dans Auth0. */
  auth0Audience(): string {
    return this.auth0AudienceValue;
  }

  /** Port d'écoute de l'API. */
  port(): number {
    return this.portValue;
  }

  /**
   * Jeton d'API Shopify — **secret**, donc dans l'environnement et **pas en base**.
   *
   * Les réglages non sensibles de l'intégration (domaine de la boutique, activation)
   * vivent en base et se pilotent depuis l'écran Réglages. Le jeton, non : un secret
   * en base fuite par les sauvegardes, les exports et les logs, et se retrouve lisible
   * par quiconque ouvre l'admin. L'écran affiche seulement s'il est **présent**.
   */
  shopifyAdminToken(): string | null {
    return this.shopifyToken;
  }

  /**
   * Identifiants d'app **Dev Dashboard** — l'unique manière d'obtenir un jeton
   * depuis le 01/01/2026 (plus aucun token statique n'y est affiché). Échangés
   * server-to-server via le *client credentials grant*. Deux secrets, jamais en base.
   * `null` tant que l'un des deux manque : une moitié d'identifiant est inutile.
   */
  shopifyOAuthCredentials(): ShopifyOAuthCredentials | null {
    if (
      this.shopifyClientIdValue === null ||
      this.shopifyClientSecretValue === null
    ) {
      return null;
    }
    return {
      clientId: this.shopifyClientIdValue,
      clientSecret: this.shopifyClientSecretValue,
    };
  }

  /**
   * L'intégration peut passer en mode réel dès qu'**un** chemin d'authentification
   * est approvisionné : soit le jeton legacy statique, soit la paire client
   * credentials. L'écran n'affiche que cette présence, jamais les secrets eux-mêmes.
   */
  hasShopifyCredentials(): boolean {
    return (
      this.shopifyToken !== null || this.shopifyOAuthCredentials() !== null
    );
  }
}

/**
 * Les fichiers d'environnement à charger, **du plus fort au plus faible**.
 *
 * `.env` (gitignoré) porte ce qui est propre à la machine et ce qui est secret.
 * `.env.development` (versionné) porte les coordonnées de l'infra **dockerisée**
 * — port et base du conteneur : rien qui n'engage, et tout ce qu'il fallait
 * recopier à la main avant que l'app démarre.
 *
 * L'ordre est celui de `@nestjs/config` : une variable déjà posée dans
 * l'environnement réel gagne sur les deux fichiers, et `.env` gagne sur les
 * défauts — le dépôt ne peut pas écraser ta configuration.
 *
 * Hors développement, les défauts ne sont **pas** chargés : en production une
 * variable manquante doit faire échouer le démarrage, pas retomber en silence
 * sur un `localhost` qui n'existe pas.
 */
export function envFilePaths(): string[] {
  const production = (process.env['NODE_ENV']?.trim() ?? '') === 'production';
  return production ? ['.env'] : ['.env', '.env.development'];
}

function optional(name: string): string | null {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? null : value;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Voir .env.example.`,
    );
  }
  return value;
}

function optionalPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `${name} invalide : "${raw}" (port attendu entre 1 et 65535).`,
    );
  }
  return parsed;
}
