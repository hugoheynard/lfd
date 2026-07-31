import { Injectable } from "@nestjs/common";
import type { S3StorageConfig } from "@lfd/storage";

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
  private readonly storage: S3StorageConfig | null;
  private readonly portValue: number;
  private readonly impersonation: DevImpersonationConfig | null;
  private readonly adminAudienceValue: string | null;
  private readonly adminBypass: boolean;

  constructor() {
    this.database = required("DATABASE_B2B_URL");
    this.auth0DomainValue = required("AUTH0_DOMAIN");
    this.auth0AudienceValue = required("AUTH0_AUDIENCE");
    this.management = optionalManagementCredentials();
    this.storage = optionalStorageConfig();
    this.portValue = optionalPort("PORT", 3200);
    this.impersonation = optionalDevImpersonation();
    this.adminAudienceValue = optionalString("AUTH0_ADMIN_AUDIENCE");
    this.adminBypass = optionalAdminDevBypass();
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

  /**
   * Configuration du **stockage objet** (R2/S3) pour les KBIS, ou `null` si le
   * bucket n'est pas configuré.
   *
   * Optionnel comme le M2M : l'API démarre sans (dev, CI). C'est l'adaptateur qui
   * refuse explicitement dépôt et téléchargement quand c'est `null` — le reste de
   * l'app fonctionne, seul le KBIS est indisponible.
   */
  storageConfig(): S3StorageConfig | null {
    return this.storage;
  }

  /** Port d'écoute de l'API. */
  port(): number {
    return this.portValue;
  }

  /**
   * Impersonation de **DÉVELOPPEMENT**, ou `null` si désactivée.
   *
   * Quand elle est active (`AUTH_DEV_IMPERSONATE=true`), le guard **court-circuite
   * la vérification du jeton Auth0** et résout un `User` de la base directement.
   * C'est un bypass d'authentification : il ne doit JAMAIS exister ailleurs qu'en
   * local. Le garde-fou est ici, au boot — `optionalDevImpersonation` **refuse de
   * démarrer** si le flag est mis avec `NODE_ENV=production` (fail-closed).
   */
  devImpersonation(): DevImpersonationConfig | null {
    return this.impersonation;
  }

  /**
   * Audience Auth0 de la surface **staff** (app admin), ou `null` si non
   * configurée. Distincte de l'audience client (`AUTH0_AUDIENCE`) — c'est elle
   * qui sépare les deux surfaces (Invariant C). Optionnelle : l'API démarre sans
   * (dev par bypass, CI) ; c'est `AdminTokenVerifier` qui **refuse** tout token
   * quand elle est `null` (fail-closed).
   */
  auth0AdminAudience(): string | null {
    return this.adminAudienceValue;
  }

  /**
   * Bypass d'authentification **staff** de DÉVELOPPEMENT (`AUTH_ADMIN_DEV_BYPASS`).
   *
   * Quand il est actif, la surface `/admin/*` ne vérifie aucun token : le guard
   * pose un staff synthétique. Comme l'impersonation client, c'est un bypass qui
   * ne doit JAMAIS exister en prod — le garde-fou `optionalAdminDevBypass`
   * **refuse de démarrer** si le flag est mis avec `NODE_ENV=production`.
   */
  adminDevBypass(): boolean {
    return this.adminBypass;
  }
}

/** Réglage de l'impersonation de dev : le sujet par défaut (ou `null`). */
export interface DevImpersonationConfig {
  /** `auth0_sub` ou e-mail par défaut à impersonater, ou `null` (alors header requis). */
  readonly subject: string | null;
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

/**
 * Configuration R2/S3, ou `null` si non fournie.
 *
 * `bucket`, `accessKeyId` et `secretAccessKey` forment le trio requis : si l'un
 * est là, les trois doivent l'être (une config partielle est une erreur de
 * démarrage, pas un `undefined` découvert au premier dépôt). `endpoint` (l'URL
 * R2) et `region` sont optionnels — `region` vaut « auto » côté service.
 */
function optionalStorageConfig(): S3StorageConfig | null {
  const bucket = process.env["STORAGE_BUCKET"]?.trim() ?? "";
  const accessKeyId = process.env["STORAGE_ACCESS_KEY_ID"]?.trim() ?? "";
  const secretAccessKey = process.env["STORAGE_SECRET_ACCESS_KEY"]?.trim() ?? "";
  const endpoint = process.env["STORAGE_ENDPOINT"]?.trim() ?? "";
  const region = process.env["STORAGE_REGION"]?.trim() ?? "";

  if (bucket === "" && accessKeyId === "" && secretAccessKey === "") {
    return null;
  }
  if (bucket === "" || accessKeyId === "" || secretAccessKey === "") {
    throw new Error(
      "STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID et STORAGE_SECRET_ACCESS_KEY vont ensemble : renseignez les trois, ou aucun.",
    );
  }
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    ...(endpoint !== "" ? { endpoint } : {}),
    ...(region !== "" ? { region } : {}),
  };
}

/**
 * Lit le flag d'impersonation de dev. **Fail-closed** : si le flag est actif
 * alors que `NODE_ENV=production`, on refuse de démarrer plutôt que d'ouvrir un
 * bypass d'auth en prod. Absent ou différent de `"true"` ⇒ `null` (désactivé).
 */
function optionalDevImpersonation(): DevImpersonationConfig | null {
  const enabled = process.env["AUTH_DEV_IMPERSONATE"]?.trim().toLowerCase() === "true";
  if (!enabled) {
    return null;
  }
  if ((process.env["NODE_ENV"]?.trim() ?? "") === "production") {
    throw new Error(
      "AUTH_DEV_IMPERSONATE=true est INTERDIT en production : l'impersonation contourne " +
        "l'authentification. Elle n'existe qu'en développement local.",
    );
  }
  const subject = process.env["AUTH_DEV_IMPERSONATE_SUBJECT"]?.trim() ?? "";
  return { subject: subject === "" ? null : subject };
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Variable d'environnement manquante : ${name}. Voir .env.example.`);
  }
  return value;
}

/** Variable optionnelle : sa valeur trimée, ou `null` si absente/vide. */
function optionalString(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  return value === "" ? null : value;
}

/**
 * Lit le flag de bypass staff de dev. **Fail-closed** : actif avec
 * `NODE_ENV=production` ⇒ refus de démarrer (un bypass d'auth staff en prod
 * serait une faille). Absent ou différent de `"true"` ⇒ `false`.
 */
function optionalAdminDevBypass(): boolean {
  const enabled = process.env["AUTH_ADMIN_DEV_BYPASS"]?.trim().toLowerCase() === "true";
  if (enabled && (process.env["NODE_ENV"]?.trim() ?? "") === "production") {
    throw new Error(
      "AUTH_ADMIN_DEV_BYPASS=true est INTERDIT en production : il contourne " +
        "l'authentification staff. Il n'existe qu'en développement local.",
    );
  }
  return enabled;
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
