import { Injectable } from "@nestjs/common";

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
  private readonly management: Auth0ManagementCredentials | null;
  private readonly portValue: number;

  constructor() {
    this.database = required("DATABASE_B2B_URL");
    this.auth0DomainValue = required("AUTH0_DOMAIN");
    this.auth0AudienceValue = required("AUTH0_AUDIENCE");
    this.management = optionalManagementCredentials();
    this.portValue = optionalPort("PORT", 3200);
  }

  /**
   * URL de connexion à la db commerce. Nommée `DATABASE_B2B_URL` — préfixée par
   * app pour ne pas collisionner avec les autres bases (admin, PIM) si les env
   * se partagent un jour.
   *
   * Deux schémas acceptés, et c'est le schéma qui choisit le transport côté
   * `PrismaService` : `prisma+postgres://…` (Prisma Postgres via Accelerate —
   * prod et dev) ou `postgresql://…` (Postgres joignable en direct — tests e2e
   * sur base jetable).
   */
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

  /**
   * Identifiants **M2M** de la Management API Auth0, ou `null` si le canal n'est
   * pas configuré.
   *
   * Volontairement **optionnel**, contrairement aux autres réglages Auth0 : il ne
   * sert qu'au changement d'e-mail. Le rendre obligatoire empêcherait l'API de
   * démarrer en développement et en CI pour une fonctionnalité marginale. C'est
   * l'adaptateur qui refuse explicitement l'opération quand c'est `null` — pas le
   * boot qui échoue.
   */
  auth0ManagementCredentials(): Auth0ManagementCredentials | null {
    return this.management;
  }

  /** Port d'écoute de l'API. */
  port(): number {
    return this.portValue;
  }
}

/** Application M2M autorisée sur la Management API du tenant. */
export interface Auth0ManagementCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * Les deux valeurs vont **ensemble** : n'en fournir qu'une est une erreur de
 * configuration qu'il vaut mieux voir au démarrage qu'au premier changement
 * d'e-mail, six mois plus tard.
 */
function optionalManagementCredentials(): Auth0ManagementCredentials | null {
  const clientId = process.env["AUTH0_M2M_CLIENT_ID"]?.trim() ?? "";
  const clientSecret = process.env["AUTH0_M2M_CLIENT_SECRET"]?.trim() ?? "";

  if (clientId === "" && clientSecret === "") {
    return null;
  }
  if (clientId === "" || clientSecret === "") {
    throw new Error(
      "AUTH0_M2M_CLIENT_ID et AUTH0_M2M_CLIENT_SECRET vont ensemble : renseignez les deux, ou aucune.",
    );
  }
  return { clientId, clientSecret };
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Variable d'environnement manquante : ${name}. Voir .env.example.`);
  }
  return value;
}

function optionalPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} invalide : "${raw}" (port attendu entre 1 et 65535).`);
  }
  return parsed;
}
