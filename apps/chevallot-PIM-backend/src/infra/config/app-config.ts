import { Injectable } from '@nestjs/common';

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
export class AppConfig {
  private readonly database: string;
  private readonly auth0DomainValue: string;
  private readonly auth0AudienceValue: string;
  private readonly portValue: number;
  private readonly shopifyToken: string | null;

  constructor() {
    this.database = required('DATABASE_URL');
    this.auth0DomainValue = required('AUTH0_DOMAIN');
    this.auth0AudienceValue = required('AUTH0_AUDIENCE');
    this.portValue = optionalPort('PORT', 3100);
    this.shopifyToken = optional('SHOPIFY_ADMIN_TOKEN');
  }

  /** URL Postgres (Docker en dev, Neon en prod — ADR-09). */
  databaseUrl(): string {
    return this.database;
  }

  /** Tenant Auth0, sans schéma ni slash — ex. `chevallot.eu.auth0.com`. */
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

  /** L'intégration ne peut fonctionner que si le secret est fourni. */
  hasShopifyToken(): boolean {
    return this.shopifyToken !== null;
  }
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
