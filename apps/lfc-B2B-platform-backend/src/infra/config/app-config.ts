import { Injectable } from "@nestjs/common";
import type { S3StorageConfig } from "@lfd/storage";

import { normalizeBootstrapEmail } from "../../staff-users/domain/bootstrap-admin.js";

import {
  optionalAdminDevBypass,
  optionalDevImpersonation,
  optionalMailerConfig,
  optionalManagementCredentials,
  optionalPort,
  optionalR2Storage,
  optionalString,
  optionalStripeConfig,
  type R2StorageUsage,
  required,
} from "./env-readers.js";

/**
 * Passerelle **unique** vers l'environnement.
 *
 * C'est le seul endroit du backend autorisé à lire `process.env` — la règle
 * ESLint `no-restricted-properties` interdit l'accès direct partout ailleurs.
 * Tout le reste passe par ces méthodes : **typées**, **validées une seule fois
 * au démarrage** (fail-fast plutôt qu'un `undefined` qui se propage), et
 * **substituables en test** via l'injection.
 */
/**
 * La connexion où naissent les identités **client**. Comme celle de l'équipe :
 * valeur **constatée dans le tenant**, pas devinée.
 *
 * Le défaut d'usine d'Auth0 (`Username-Password-Authentication`) était en place
 * et ne visait rien : ce tenant n'a que ses deux connexions nommées. Auth0
 * répondait donc en erreur — et pas le `409` qui aurait déclenché la reprise par
 * e-mail — si bien que **toute** ouverture d'accès remontait un `500`. Un défaut
 * plausible mais faux est pire que pas de défaut : il désigne silencieusement
 * une base d'utilisateurs qui n'existe pas.
 */
const DEFAULT_AUTH0_DB_CONNECTION = "lfc-b2b-customers";

/**
 * La connexion où naissent les identités **de l'équipe**. Valeur constatée dans
 * le tenant, pas devinée : elle existe, et c'est elle qui sépare l'équipe des
 * clients chez le fournisseur d'identité.
 */
const DEFAULT_AUTH0_STAFF_CONNECTION = "lfc-staff";

@Injectable()
export class AppConfig {
  private readonly database: string;
  private readonly auth0DomainValue: string;
  private readonly auth0AudienceValue: string;
  private readonly auth0ConnectionValue: string;
  private readonly auth0StaffConnectionValue: string;
  private readonly clientBaseUrlValue: string | null;
  private readonly management: Auth0ManagementCredentials | null;
  private readonly stripeValue: StripeConfig | null;
  private readonly mailerValue: MailerConfig;
  private readonly portValue: number;
  private readonly impersonation: DevImpersonationConfig | null;
  private readonly adminAudienceValue: string | null;
  private readonly bootstrapAdminEmailValue: string;
  private readonly adminBypass: boolean;
  private readonly recomputeTokenValue: string | null;
  private readonly adminBaseUrlValue: string | null;
  private readonly exposeDetail: boolean;
  private readonly production: boolean;

  constructor() {
    this.database = required("DATABASE_B2B_URL");
    this.auth0DomainValue = required("AUTH0_DOMAIN");
    this.auth0AudienceValue = required("AUTH0_AUDIENCE");
    this.auth0ConnectionValue =
      optionalString("AUTH0_DB_CONNECTION") ?? DEFAULT_AUTH0_DB_CONNECTION;
    this.auth0StaffConnectionValue =
      optionalString("AUTH0_STAFF_CONNECTION") ?? DEFAULT_AUTH0_STAFF_CONNECTION;
    this.clientBaseUrlValue = optionalString("CLIENT_BASE_URL");
    this.management = optionalManagementCredentials();
    this.stripeValue = optionalStripeConfig();
    this.mailerValue = optionalMailerConfig();
    this.portValue = optionalPort("PORT", 3200);
    this.impersonation = optionalDevImpersonation();
    this.adminAudienceValue = optionalString("AUTH0_ADMIN_AUDIENCE");
    this.bootstrapAdminEmailValue = normalizeBootstrapEmail(
      optionalString("BOOTSTRAP_ADMIN_EMAIL") ?? "",
    );
    this.adminBypass = optionalAdminDevBypass();
    this.recomputeTokenValue = optionalString("RECOMPUTE_TOKEN");
    this.adminBaseUrlValue = optionalString("ADMIN_BASE_URL");
    this.production = (process.env["NODE_ENV"]?.trim() ?? "") === "production";
    this.exposeDetail = !this.production;
  }

  /**
   * Racine publique du back-office, pour les liens des e-mails internes.
   *
   * **Optionnelle** : sans elle, un e-mail part sans bouton plutôt qu'avec un
   * lien cassé. Inventer une URL par défaut donnerait un bouton qui ne mène
   * nulle part, ce qui est pire que pas de bouton.
   */
  adminBaseUrl(): string | null {
    return this.adminBaseUrlValue;
  }

  /** Vrai en production (`NODE_ENV=production`). Choisit notamment l'allowlist CORS. */
  isProduction(): boolean {
    return this.production;
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
   * Nom de la **connexion base de données** Auth0 où naissent les identités
   * client (`AUTH0_DB_CONNECTION`). Un défaut plutôt qu'un réglage obligatoire,
   * pour la même raison que côté équipe : l'exiger ferait échouer le boot en dev
   * et en CI pour une valeur que personne ne change. Mais ce défaut est celui du
   * **tenant**, pas celui d'usine d'Auth0 — cf. {@link DEFAULT_AUTH0_DB_CONNECTION}.
   */
  auth0DatabaseConnection(): string {
    return this.auth0ConnectionValue;
  }

  /**
   * Nom de la connexion Auth0 où naissent les identités **de l'équipe**
   * (`AUTH0_STAFF_CONNECTION`).
   *
   * Distincte de la connexion client, et c'est tout l'intérêt : un client ne
   * peut pas s'authentifier contre une surface interne, et ce refus arrive
   * avant le moindre code applicatif. Une même adresse présente des deux côtés
   * donne **deux identités**, avec deux `sub` — voulu : deux rôles, deux
   * sessions.
   */
  auth0StaffConnection(): string {
    return this.auth0StaffConnectionValue;
  }

  /**
   * Racine publique de l'espace **client**, pour les liens des e-mails qui lui
   * sont adressés. Optionnelle comme celle du back-office : sans elle on omet la
   * destination de retour, plutôt que d'inventer une URL qui ne mène nulle part.
   */
  clientBaseUrl(): string | null {
    return this.clientBaseUrlValue;
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
   * De quoi parler au stockage d'un **usage** donné, ou `null` s'il n'est pas
   * configuré.
   *
   * Chaque usage porte son bucket ET ses clés : un jeton n'ouvre que le sien.
   * Seuls l'endpoint et la région restent communs — ce sont des faits du compte.
   *
   * Optionnel comme le M2M : l'API démarre sans (dev, CI). C'est l'adaptateur
   * qui refuse explicitement quand c'est `null` — le reste de l'app fonctionne,
   * seul cet usage est indisponible.
   */
  r2Storage(usage: R2StorageUsage): S3StorageConfig | null {
    return optionalR2Storage(usage);
  }

  /**
   * Configuration **Stripe** (encaissement carte des commandes `per_order`), ou
   * `null` si le canal n'est pas configuré.
   *
   * Optionnel comme le M2M et le stockage : l'API démarre sans (le reste de la
   * plateforme — panier, commandes sur terme différé — fonctionne). C'est
   * l'adaptateur `StripePaymentGateway` qui **refuse** explicitement de créer une
   * intention ou de vérifier un webhook quand c'est `null`, jamais le boot.
   *
   * Les trois valeurs vont ensemble : la clé secrète (`sk_…`) signe les appels
   * serveur, le secret de webhook (`whsec_…`) authentifie les événements reçus, la
   * clé publique (`pk_…`, **non secrète**) part au navigateur pour le Payment
   * Element.
   */
  stripeConfig(): StripeConfig | null {
    return this.stripeValue;
  }

  /**
   * Réglages e-mail. **Toujours présent** — contrairement à Stripe : sans clé,
   * `apiKey` vaut `null` et le mailer part à blanc (il journalise au lieu
   * d'envoyer). C'est ce qui permet au développement, aux tests et à la CI de
   * tourner sans compte fournisseur, sans qu'aucun appelant n'ait à le savoir.
   */
  mailerConfig(): MailerConfig {
    return this.mailerValue;
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
   * Bypass d'authentification **staff** de DÉVELOPPEMENT (surface `/admin/*`).
   *
   * Actif si `AUTH_ADMIN_DEV_BYPASS=true` **ou** si l'impersonation client est
   * active (`AUTH_DEV_IMPERSONATE=true`) : c'est **le même interrupteur « auth
   * off en dev »**, on ne demande pas de flag séparé pour l'admin. Quand il est
   * actif, `/admin/*` ne vérifie aucun token (le guard pose un staff synthétique).
   *
   * **Fail-closed** : les deux flags refusent de démarrer avec
   * `NODE_ENV=production` (cf. leurs helpers), donc `adminDevBypass()` est
   * toujours `false` en prod.
   */
  adminDevBypass(): boolean {
    return this.adminBypass || this.impersonation !== null;
  }

  /**
   * E-mail de l'**admin racine** (`BOOTSTRAP_ADMIN_EMAIL`), semé au boot et
   * protégé de toute suppression, rétrogradation ou renommage.
   *
   * Configurable **par déploiement** : c'est la porte de secours du back-office,
   * et elle ne sert que si elle pointe une boîte que quelqu'un relève vraiment.
   * Un compte Auth0 doit exister à cette adresse dans la connexion staff, sinon
   * personne n'entre au premier déploiement.
   */
  bootstrapAdminEmail(): string {
    return this.bootstrapAdminEmailValue;
  }

  /**
   * Jeton partagé qui protège `POST /admin/recompute` (le recalcul batch du
   * read-model `lead_score`). Le **Cloudflare Cron Trigger** le présente dans
   * l'en-tête `x-lfc-recompute-token` ; le container le compare à cette valeur.
   * `null` si non configuré — le guard **refuse alors tout** en prod (fail-closed),
   * sauf sous le bypass de dev qui court-circuite la vérification.
   */
  recomputeToken(): string | null {
    return this.recomputeTokenValue;
  }

  /**
   * Faut-il joindre le **détail technique** d'une erreur 500 à la réponse HTTP ?
   *
   * `true` hors production, `false` en production. Le message renvoyé au client
   * reste **toujours** neutre (cf. `AppErrorFilter`) : ce flag n'ouvre qu'un champ
   * `detail` **supplémentaire**, pour lire la cause dans l'onglet réseau en dev
   * sans avoir à ouvrir les logs serveur. En prod il est fermé — zéro indice
   * exploitable ne sort de l'API.
   */
  exposeErrorDetail(): boolean {
    return this.exposeDetail;
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
 * Réglages Stripe. `secretKey` et `webhookSecret` sont **secrets** (serveur only) ;
 * `publishableKey` est publique (destinée au bundle navigateur). Le préfixe
 * `sk_test_`/`pk_test_`/`whsec_` distingue le mode test du live — on ne le contrôle
 * pas ici (Stripe le porte dans la clé), mais tout le module suppose le mode test.
 */
/**
 * Réglages e-mail transactionnel (Resend).
 *
 * `staffInbox` est l'adresse qui reçoit les **alertes internes** (un rendez-vous
 * pris, une demande de rappel déposée). Elle est distincte de `replyTo` : l'une
 * dit où l'équipe est prévenue, l'autre où un client répond.
 */
export interface MailerConfig {
  /** Clé Resend, ou `null` — alors le mailer tourne à blanc. */
  readonly apiKey: string | null;
  readonly fromAddress: string;
  readonly replyTo: string | null;
  /** Boîte de l'équipe commerciale, ou `null` : aucune alerte interne ne part. */
  readonly staffInbox: string | null;
}

export interface StripeConfig {
  readonly secretKey: string;
  readonly webhookSecret: string;
  readonly publishableKey: string;
}
