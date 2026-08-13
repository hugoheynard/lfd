import type {
  Auth0ManagementCredentials,
  DevImpersonationConfig,
  MailerConfig,
  StripeConfig,
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
 * La **connexion** R2, ou `null` si le canal n'est pas configuré.
 *
 * Séparée du bucket, et c'est tout l'intérêt : l'endpoint, la région et les
 * clés sont des propriétés du COMPTE — elles ne changent pas d'un bucket à
 * l'autre. Les répéter par usage produirait cinq réglages par bucket, dont
 * quatre identiques, qu'il faudrait tenir alignés à la main.
 *
 * `accessKeyId` et `secretAccessKey` vont ensemble : une connexion à moitié
 * renseignée est une erreur de démarrage, pas un `undefined` découvert au
 * premier dépôt de fichier.
 */
export function optionalR2Connection(): R2Connection | null {
  const accessKeyId = optionalString("R2_ACCESS_KEY_ID") ?? "";
  const secretAccessKey = optionalString("R2_SECRET_ACCESS_KEY") ?? "";
  const endpoint = optionalString("R2_ENDPOINT") ?? "";
  const region = optionalString("R2_REGION") ?? "";

  if (accessKeyId === "" && secretAccessKey === "") {
    return null;
  }
  if (accessKeyId === "" || secretAccessKey === "") {
    throw new Error(
      "R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY vont ensemble : renseignez les deux, ou aucun.",
    );
  }
  return {
    accessKeyId,
    secretAccessKey,
    ...(endpoint !== "" ? { endpoint } : {}),
    ...(region !== "" ? { region } : {}),
  };
}

/**
 * Le nom du bucket d'un **usage**, ou `null` s'il n'est pas nommé.
 *
 * Un usage = un bucket = **une** variable. Ajouter un stockage (exports,
 * factures, avatars…) coûte donc une ligne d'environnement, pas cinq — et son
 * nom dit à quoi il sert, ce qu'un `STORAGE_BUCKET` générique ne pouvait plus
 * faire dès le deuxième.
 */
export function optionalR2Bucket(usage: R2BucketUsage): string | null {
  return optionalString(R2_BUCKET_SETTINGS[usage]);
}

/** Les usages de stockage de cette app. Un de plus ⇒ une ligne de plus ici. */
export type R2BucketUsage = "kbis";

/**
 * La variable d'environnement qui nomme le bucket de chaque usage.
 *
 * Table explicite plutôt que nom calculé (`R2_BUCKET_${usage.toUpperCase()}`) :
 * un nom construit à la volée est invisible à une recherche plein texte, et
 * c'est précisément ce qu'on lit quand on cherche « d'où vient ce bucket ».
 */
const R2_BUCKET_SETTINGS: Readonly<Record<R2BucketUsage, string>> = {
  kbis: "R2_BUCKET_KBIS",
};

/** La partie « compte » d'une configuration R2, commune à tous les buckets. */
export interface R2Connection {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  endpoint?: string;
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
  };
}

const DEFAULT_FROM_ADDRESS = "no-reply@lafoliedouce.fr";
