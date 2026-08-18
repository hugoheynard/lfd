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
 * **Ce qui est propre à l'usage, et ce qui ne l'est pas.** L'endpoint et la
 * région sont des faits du COMPTE : ils ne changent pas d'un bucket à l'autre,
 * et les répéter par usage produirait des copies à tenir alignées à la main. Le
 * bucket et les clés, eux, appartiennent à l'usage — c'est ce qui permet à un
 * jeton de n'ouvrir QUE ce bucket.
 *
 * Cette isolation est le vrai sujet : les KBIS sont des pièces d'identité
 * d'entreprise. Le jour où un autre bucket sert à des assets publics, un jeton
 * fuité depuis là ne doit pas ouvrir les papiers des clients.
 *
 * Les deux clés vont ENSEMBLE : une configuration à moitié posée est une erreur
 * de démarrage, pas un `undefined` découvert au premier dépôt de fichier.
 */
export function optionalR2Storage(usage: R2StorageUsage): S3StorageConfig | null {
  const names = R2_SETTINGS[usage];
  const bucket = optionalString(names.bucket) ?? "";
  const accessKeyId = optionalString(names.accessKeyId) ?? "";
  const secretAccessKey = optionalString(names.secretAccessKey) ?? "";

  if (bucket === "" && accessKeyId === "" && secretAccessKey === "") {
    return null;
  }
  if (bucket === "" || accessKeyId === "" || secretAccessKey === "") {
    throw new Error(
      `${names.bucket}, ${names.accessKeyId} et ${names.secretAccessKey} vont ensemble : ` +
        "renseignez les trois, ou aucun.",
    );
  }
  const endpoint = optionalString("R2_ENDPOINT");
  const region = optionalString("R2_REGION");
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    ...(endpoint === null ? {} : { endpoint }),
    ...(region === null ? {} : { region }),
  };
}

/** Les stockages de cette app. Un de plus ⇒ une entrée de plus ci-dessous. */
export type R2StorageUsage = "kbis";

/**
 * Les variables d'environnement de chaque usage.
 *
 * Table explicite plutôt que noms calculés : un nom construit à la volée
 * (`R2_${usage}_BUCKET`) est invisible à une recherche plein texte — exactement
 * ce qu'on lit quand on cherche d'où vient un bucket ou quelle clé l'ouvre.
 */
const R2_SETTINGS: Readonly<
  Record<R2StorageUsage, { bucket: string; accessKeyId: string; secretAccessKey: string }>
> = {
  kbis: {
    bucket: "R2_KBIS_BUCKET",
    accessKeyId: "R2_KBIS_ACCESS_KEY_ID",
    secretAccessKey: "R2_KBIS_SECRET_ACCESS_KEY",
  },
};

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
