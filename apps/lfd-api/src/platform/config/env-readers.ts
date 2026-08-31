import type { S3StorageConfig } from "@lfd/storage";

import type {
  AnalyticsConfig,
  Auth0ManagementCredentials,
  DevImpersonationConfig,
  MailerConfig,
  StripeConfig,
  WebPushConfig,
} from "./app-config.js";

/**
 * Les **lecteurs d'environnement** — la seule autre porte que `AppConfig` vers
 * `process.env`, extraite pour que la passerelle elle-même reste lisible.
 *
 * Chacun applique la même discipline : lire une fois, trimer, et **échouer au
 * démarrage** plutôt que de laisser un réglage à moitié posé se découvrir six
 * mois plus tard, en production, au premier usage.
 */

/**
 * Les fichiers d'environnement à charger, **du plus fort au plus faible**.
 *
 * `.env` (gitignoré) porte ce qui est propre à la machine et ce qui est secret.
 * `.env.development` (versionné) porte les coordonnées de l'infra **dockerisée**
 * — ports, base, bucket, identifiants du conteneur : rien qui n'engage, et tout
 * ce qu'il fallait jusqu'ici recopier à la main avant que l'app démarre.
 *
 * L'ordre compte, et il est celui de `@nestjs/config` : une variable déjà posée
 * dans l'environnement réel gagne sur les deux fichiers, et `.env` gagne sur les
 * défauts. On ne peut donc pas se faire écraser sa configuration par le dépôt.
 *
 * Hors développement, les défauts ne sont **pas** chargés : en production une
 * variable manquante doit faire échouer le démarrage, pas retomber en silence
 * sur un `localhost` qui n'existe pas.
 */
export function envFilePaths(): string[] {
  const production = (process.env["NODE_ENV"]?.trim() ?? "") === "production";
  return production ? [".env"] : [".env", ".env.development"];
}

export function optionalManagementCredentials(): Auth0ManagementCredentials | null {
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
 * De quoi parler au stockage d'un **usage** : son bucket, ses clés — ou `null`
 * si ce stockage n'est pas configuré.
 *
 * **Ce qui est propre à l'usage, et ce qui ne l'est pas.** Le bucket et les
 * clés appartiennent à l'usage — c'est ce qui permet à un jeton de n'ouvrir QUE
 * ce bucket. La région est un fait du COMPTE (`auto` partout).
 *
 * ⚠️ **L'endpoint N'EN EST PAS UN**, contrairement à ce que cette même page a
 * affirmé jusqu'au 2026-08-22. Il dépend de la JURIDICTION du bucket, qui se
 * choisit à sa création :
 *
 * - `lfc-b2b-kbis` est en juridiction **EU** → `…{account}.eu.r2.cloudflarestorage.com`
 * - `lfc-media` n'a aucune juridiction         → `…{account}.r2.cloudflarestorage.com`
 *
 * Un seul `R2_ENDPOINT` ne peut donc pas servir les deux : celui de l'autre
 * rend une erreur S3 opaque au premier dépôt. L'endpoint est par usage, avec
 * repli sur la valeur commune — ce qui garde une configuration à une variable
 * tant que tous les buckets partagent une juridiction, et la rend correcte dès
 * qu'ils divergent.
 *
 * Cette isolation est le vrai sujet : les KBIS sont des pièces d'identité
 * d'entreprise. Le jour où un autre bucket sert à des assets publics, un jeton
 * fuité depuis là ne doit pas ouvrir les papiers des clients.
 *
 * Les trois valeurs vont ENSEMBLE. Une configuration à moitié posée n'est
 * cependant PAS une erreur de démarrage — voir {@link R2StorageState} : elle
 * éteint l'usage et se dit dans le bulletin, elle ne couche pas l'API.
 */
export function optionalR2Storage(usage: R2StorageUsage): R2StorageState {
  const names = R2_SETTINGS[usage];
  const values = {
    [names.bucket]: optionalString(names.bucket) ?? "",
    [names.accessKeyId]: optionalString(names.accessKeyId) ?? "",
    [names.secretAccessKey]: optionalString(names.secretAccessKey) ?? "",
  };
  const posed = Object.entries(values).filter(([, value]) => value !== "");

  if (posed.length === 0) {
    return ABSENT;
  }
  if (posed.length < Object.keys(values).length) {
    // À MOITIÉ posé : on refuse l'usage, pas le démarrage — mais on nomme ce
    // qui manque, sans quoi ce serait la panne silencieuse que tout ce module
    // existe pour éviter.
    return {
      config: null,
      missing: Object.entries(values)
        .filter(([, value]) => value === "")
        .map(([name]) => name),
    };
  }

  const endpoint = optionalString(names.endpoint) ?? optionalString("R2_ENDPOINT");
  const region = optionalString("R2_REGION");
  return {
    config: {
      bucket: values[names.bucket] ?? "",
      accessKeyId: values[names.accessKeyId] ?? "",
      secretAccessKey: values[names.secretAccessKey] ?? "",
      ...(endpoint === null ? {} : { endpoint }),
      ...(region === null ? {} : { region }),
    },
    missing: [],
  };
}

const ABSENT: R2StorageState = { config: null, missing: [] };

/**
 * L'état d'un stockage, en **trois** cas et non deux.
 *
 * - `config` posée, `missing` vide → utilisable ;
 * - `config` nulle, `missing` vide → délibérément absent (dev, CI) : normal ;
 * - `config` nulle, `missing` peuplé → **à moitié posé**, donc presque
 *   certainement une faute de frappe dans un nom de variable.
 *
 * Le troisième cas levait, et faisait donc échouer le DÉMARRAGE de toute l'API
 * — alors que `capability-audit` énonce que seules trois variables ont ce droit,
 * et que « rendre ces réglages obligatoires mettrait la boutique hors ligne pour
 * une invitation cassée ». Poser les variables puis le secret est une séquence
 * de déploiement ordinaire ; elle ne doit pas coûter une panne totale.
 *
 * Le refus est donc devenu une DONNÉE : l'usage s'éteint, le bulletin de
 * démarrage nomme les variables manquantes, et le reste de la plateforme sert.
 */
export interface R2StorageState {
  readonly config: S3StorageConfig | null;
  /** Les variables posées à moitié. Vide ⇒ rien à signaler. */
  readonly missing: readonly string[];
}

/** Les stockages de cette app. Un de plus ⇒ une entrée de plus ci-dessous. */
export type R2StorageUsage = "kbis" | "media";

/**
 * Les variables d'environnement de chaque usage.
 *
 * Table explicite plutôt que noms calculés : un nom construit à la volée
 * (`R2_${usage}_BUCKET`) est invisible à une recherche plein texte — exactement
 * ce qu'on lit quand on cherche d'où vient un bucket ou quelle clé l'ouvre.
 */
const R2_SETTINGS: Readonly<
  Record<
    R2StorageUsage,
    { bucket: string; accessKeyId: string; secretAccessKey: string; endpoint: string }
  >
> = {
  kbis: {
    bucket: "R2_KBIS_BUCKET",
    accessKeyId: "R2_KBIS_ACCESS_KEY_ID",
    secretAccessKey: "R2_KBIS_SECRET_ACCESS_KEY",
    endpoint: "R2_KBIS_ENDPOINT",
  },
  media: {
    bucket: "R2_MEDIA_BUCKET",
    accessKeyId: "R2_MEDIA_ACCESS_KEY_ID",
    secretAccessKey: "R2_MEDIA_SECRET_ACCESS_KEY",
    endpoint: "R2_MEDIA_ENDPOINT",
  },
};

/**
 * L'adresse **publique** du bucket média — `https://media.lafoliecoffee.info`,
 * sans barre finale.
 *
 * C'est la moitié du stockage qui ne passe PAS par nous : les octets partent du
 * bucket au navigateur, et cette valeur est tout ce que le backend en sait. Elle
 * est donc une **variable**, pas un secret : elle finit de toute façon dans le
 * HTML de chaque fiche produit.
 *
 * Séparée du triplet de l'usage parce qu'elle relève d'une autre décision : on
 * peut avoir le droit d'écrire dans un bucket sans qu'aucun domaine ne le
 * serve. `null` ⇒ le dépôt refuse, plutôt que de fabriquer des URL que personne
 * ne saura résoudre — un visuel enregistré sur une adresse morte est pire qu'un
 * dépôt refusé, parce qu'il ne se voit qu'à l'affichage.
 */
export function optionalMediaPublicBaseUrl(): string | null {
  const raw = optionalString("R2_MEDIA_PUBLIC_BASE_URL");
  if (raw === null) {
    return null;
  }
  const trimmed = raw.replace(/\/+$/, "");
  // Une valeur non servable est traitée comme ABSENTE plutôt que fatale, pour la
  // même raison que ci-dessus : servir des images en clair depuis une adresse
  // qu'on n'a pas voulue serait pire, mais coucher l'API pour ça le serait
  // encore plus. L'usage s'éteint, et le bulletin le dit.
  return isServableBaseUrl(trimmed) ? trimmed : null;
}

/** Hôtes où le clair est un fait de la machine, pas une négligence de déploiement. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `https` partout — **sauf en boucle locale**, où il n'y a pas de TLS à avoir.
 *
 * Sans cette exception, le MinIO de `docker-compose.dev.yml` est INERTE : il
 * sert sur `http://localhost:9100`, l'URL publique est donc rejetée, et le dépôt
 * d'image refuse en annonçant un « stockage à moitié configuré ». On développait
 * la bibliothèque de visuels sans jamais déposer un visuel — exactement ce que
 * le conteneur MinIO avait été monté pour corriger côté KBIS.
 *
 * L'hôte est lu par `URL`, pas par un préfixe de chaîne : `localhost.exemple.fr`
 * commence par « localhost » sans être la machine de personne. Une adresse
 * publique en clair, elle, reste refusée — elle serait servie à des navigateurs.
 */
function isServableBaseUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") {
    return true;
  }
  return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
}

/**
 * Lit le flag d'impersonation de dev. **Fail-closed** : si le flag est actif
 * alors que `NODE_ENV=production`, on refuse de démarrer plutôt que d'ouvrir un
 * bypass d'auth en prod. Absent ou différent de `"true"` ⇒ `null` (désactivé).
 */
export function optionalDevImpersonation(): DevImpersonationConfig | null {
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

/**
 * Configuration Stripe, ou `null` si non fournie. Les trois valeurs vont
 * **ensemble** : n'en fournir qu'une (ou deux) est une erreur de configuration
 * qu'il vaut mieux voir au démarrage qu'au premier paiement. Absentes toutes les
 * trois ⇒ `null` (canal désactivé ; l'adaptateur refuse alors explicitement).
 */
export function optionalStripeConfig(): StripeConfig | null {
  const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim() ?? "";
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim() ?? "";
  const publishableKey = process.env["STRIPE_PUBLISHABLE_KEY"]?.trim() ?? "";

  if (secretKey === "" && webhookSecret === "" && publishableKey === "") {
    return null;
  }
  if (secretKey === "" || webhookSecret === "" || publishableKey === "") {
    throw new Error(
      "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET et STRIPE_PUBLISHABLE_KEY vont ensemble : renseignez les trois, ou aucune.",
    );
  }
  return { secretKey, webhookSecret, publishableKey };
}

export function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Variable d'environnement manquante : ${name}. Voir .env.example.`);
  }
  return value;
}

/** Variable optionnelle : sa valeur trimée, ou `null` si absente/vide. */
export function optionalString(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  return value === "" ? null : value;
}

/**
 * Lit le flag de bypass staff de dev. **Fail-closed** : actif avec
 * `NODE_ENV=production` ⇒ refus de démarrer (un bypass d'auth staff en prod
 * serait une faille). Absent ou différent de `"true"` ⇒ `false`.
 */
export function optionalAdminDevBypass(): boolean {
  const enabled = process.env["AUTH_ADMIN_DEV_BYPASS"]?.trim().toLowerCase() === "true";
  if (enabled && (process.env["NODE_ENV"]?.trim() ?? "") === "production") {
    throw new Error(
      "AUTH_ADMIN_DEV_BYPASS=true est INTERDIT en production : il contourne " +
        "l'authentification staff. Il n'existe qu'en développement local.",
    );
  }
  return enabled;
}

export function optionalPort(name: string, fallback: number): number {
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

/**
 * Réglages e-mail. Aucune n'est obligatoire : sans clé, le mailer part à blanc —
 * on ne bloque pas un démarrage local pour un canal sortant.
 *
 * La clé se nomme `RESEND_MAILER_B2B_API_KEY` : le compte Resend sert plusieurs
 * applications, et un nom générique laisserait croire qu'il n'y en a qu'une.
 * `RESEND_API_KEY` reste accepté pour ne pas éteindre le canal d'un
 * environnement déjà déployé le jour du renommage.
 *
 * L'adresse d'expédition, elle, a un **défaut** : un envoi sans expéditeur est
 * refusé par le fournisseur, et faire échouer le démarrage pour ça punirait le
 * développement, qui n'envoie rien.
 */
export function optionalMailerConfig(): MailerConfig {
  return {
    apiKey: optionalString("RESEND_MAILER_B2B_API_KEY") ?? optionalString("RESEND_API_KEY"),
    fromAddress: optionalString("MAILER_FROM_ADDRESS") ?? DEFAULT_FROM_ADDRESS,
    replyTo: optionalString("MAILER_REPLY_TO"),
    staffInbox: optionalString("MAILER_STAFF_INBOX"),
    webhookSecret: optionalString("RESEND_WEBHOOK_SECRET"),
  };
}

/**
 * La paire VAPID qui signe nos envois Web Push, ou `null`.
 *
 * Les deux clés vont ensemble ou aucune : une seule des deux est une paire
 * cassée, pas une configuration partielle — le service de push refuserait
 * chaque envoi, et l'écran d'abonnement offrirait un bouton qui échoue.
 *
 * `subject` doit être un `mailto:` ou une URL : la norme VAPID en fait le moyen
 * de nous joindre quand nos envois posent problème. Le défaut reprend l'adresse
 * d'expédition, qui est déjà la nôtre et déjà surveillée.
 */
export function optionalWebPushConfig(): WebPushConfig | null {
  const publicKey = optionalString("VAPID_PUBLIC_KEY");
  const privateKey = optionalString("VAPID_PRIVATE_KEY");

  if (publicKey === null && privateKey === null) {
    return null;
  }
  if (publicKey === null || privateKey === null) {
    throw new Error(
      "VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY vont ensemble : renseignez les deux, ou aucune.",
    );
  }
  return {
    publicKey,
    privateKey,
    // Le repli suit l'adresse d'expédition RÉELLEMENT configurée, pas la
    // constante : le raisonnement était « notre adresse, déjà surveillée », et
    // il ne tient que si c'est bien celle d'où partent nos e-mails. Retomber
    // sur le défaut du code aurait donné, à qui a posé `MAILER_FROM_ADDRESS`,
    // une adresse de contact que personne ne relève.
    subject:
      optionalString("VAPID_SUBJECT") ??
      `mailto:${optionalString("MAILER_FROM_ADDRESS") ?? DEFAULT_FROM_ADDRESS}`,
  };
}

/**
 * L'expéditeur par défaut, sur le domaine réellement vérifié chez Resend.
 *
 * Il valait `no-reply@lafoliedouce.fr` — un domaine que personne ne possède, et
 * qu'aucun fournisseur n'accepterait. Un défaut plausible mais faux est pire que
 * pas de défaut : il rend un mauvais réglage indiscernable d'un bon, jusqu'à ce
 * qu'un envoi soit refusé en production.
 *
 * **Sur l'apex**, et non sur un sous-domaine : une seule adresse porte tout le
 * transactionnel — accès client, invitation staff, alertes internes — et c'est
 * elle que voit la personne qui reçoit. Un futur envoi COMMERCIAL, lui, prendra
 * son propre sous-domaine : c'est le seul découpage qui protège réellement la
 * délivrabilité. Cf. `documentation/ops/mailer-resend.md`.
 */
const DEFAULT_FROM_ADDRESS = "no-reply@lafoliecoffee.info";

/**
 * Lecture d'Analytics Engine — l'identifiant de compte et le jeton d'API
 * Cloudflare qui ouvrent l'API SQL.
 *
 * Les deux vont ensemble ou aucune, même discipline que Stripe et pour la même
 * raison : une moitié de configuration est pire qu'aucune, parce qu'elle se
 * découvre au premier usage au lieu du démarrage.
 *
 * Absente, OPS bascule sur des données de **répétition** et le dit dans sa
 * réponse — il ne rend jamais un tableau vide qu'on croirait calme.
 */
export function optionalAnalyticsConfig(): AnalyticsConfig | null {
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim() ?? "";
  const apiToken = process.env["CLOUDFLARE_ANALYTICS_TOKEN"]?.trim() ?? "";

  if (accountId === "" && apiToken === "") {
    return null;
  }
  if (accountId === "" || apiToken === "") {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_ANALYTICS_TOKEN vont ensemble : renseignez les deux, ou aucune.",
    );
  }
  return { accountId, apiToken };
}

/**
 * La **publication du catalogue** est-elle ouverte sur ce déploiement ?
 *
 * `PIM_PUBLICATION_ENABLED=true` l'ouvre ; toute autre valeur, et l'absence, la
 * ferment. **Fermée par défaut**, et c'est le sens qui compte : ces gestes
 * envoient le catalogue à l'extérieur — une boutique en ligne, une plateforme
 * professionnelle — et l'extérieur ne se rattrape pas. Un déploiement qui a
 * oublié de se prononcer ne doit pas publier ; il doit se taire.
 *
 * Le développement et les suites de test l'ouvrent explicitement : ce qu'on
 * mesure est le produit entier, drapeau compris, pas la moitié qui reste
 * allumée.
 */
export function optionalPublicationEnabled(): boolean {
  return process.env["PIM_PUBLICATION_ENABLED"]?.trim().toLowerCase() === "true";
}
