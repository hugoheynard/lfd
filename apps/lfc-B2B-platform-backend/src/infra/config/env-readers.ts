import type { S3StorageConfig } from "@lfd/storage";

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
 * Configuration R2/S3, ou `null` si non fournie.
 *
 * `bucket`, `accessKeyId` et `secretAccessKey` forment le trio requis : si l'un
 * est là, les trois doivent l'être (une config partielle est une erreur de
 * démarrage, pas un `undefined` découvert au premier dépôt). `endpoint` (l'URL
 * R2) et `region` sont optionnels — `region` vaut « auto » côté service.
 */
export function optionalStorageConfig(): S3StorageConfig | null {
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
 * Réglages e-mail. Aucune n'est obligatoire : sans `RESEND_API_KEY`, le mailer
 * part à blanc — on ne bloque pas un démarrage local pour un canal sortant.
 *
 * L'adresse d'expédition, elle, a un **défaut** : un envoi sans expéditeur est
 * refusé par le fournisseur, et faire échouer le démarrage pour ça punirait le
 * développement, qui n'envoie rien.
 */
export function optionalMailerConfig(): MailerConfig {
  return {
    apiKey: optionalString("RESEND_API_KEY"),
    fromAddress: optionalString("MAILER_FROM_ADDRESS") ?? DEFAULT_FROM_ADDRESS,
    replyTo: optionalString("MAILER_REPLY_TO"),
    staffInbox: optionalString("MAILER_STAFF_INBOX"),
  };
}

const DEFAULT_FROM_ADDRESS = "no-reply@lafoliedouce.fr";
