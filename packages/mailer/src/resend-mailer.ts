import { Resend } from "resend";

import { MailerRateLimitedError, MailerSendError } from "./errors.js";
import { silentLogger } from "./types.js";
import type {
  Mailer,
  MailerLogger,
  MailReceipt,
  RenderedMail,
  SendMailArgs,
  TemplateMap,
  TemplateRegistry,
} from "./types.js";

/** Le statut par lequel Resend demande de ralentir. */
const RATE_LIMITED_STATUS = 429;
/**
 * Les 429 qui ne demandent PAS de ralentir : un quota épuisé refuse tout
 * jusqu'à sa remise à zéro, attendre n'y change rien.
 */
const QUOTA_EXHAUSTED: ReadonlySet<string> = new Set([
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
]);
/** Essais au plus quand Resend demande de ralentir, le premier compris. */
const MAX_ATTEMPTS_WHEN_RATE_LIMITED = 3;
/** L'attente quand `Retry-After` manque ou ne se lit pas comme des secondes. */
const DEFAULT_RETRY_AFTER_MS = 1_000;
/** Le plafond d'une attente : un envoi ne reste pas suspendu plus longtemps. */
const MAX_RETRY_AFTER_MS = 30_000;
const MS_PER_SECOND = 1_000;

/**
 * La part de Resend qu'on consomme, et rien de plus.
 *
 * Typer `emails.send` nous-mêmes permet de substituer un double en test sans
 * tirer les types du SDK, et rend visible en une lecture tout ce que le paquet
 * demande à son fournisseur.
 */
export interface ResendLike {
  readonly emails: {
    send: (
      payload: {
        from: string;
        to: string;
        subject: string;
        html: string;
        replyTo?: string;
        headers?: Record<string, string>;
        /**
         * Pièces jointes, dans la forme du SDK Resend : `contentId` posé ⇒ la
         * pièce est **en ligne**, et le HTML la référence par `cid:<id>`. Le SDK
         * traduit en `content_id` sur le fil ; on parle sa langue à lui, pas
         * celle du protocole.
         */
        attachments?: {
          filename: string;
          content: string;
          contentType?: string;
          contentId?: string;
        }[];
      },
      options?: { idempotencyKey?: string },
    ) => Promise<{
      data: { id: string } | null;
      error: { message: string; name?: string; statusCode?: number | null } | null;
      /**
       * Les en-têtes HTTP de la réponse, noms en minuscules. Le SDK les joint
       * aussi à un refus (`resend` 6.18.1, lu le 2026-10-07), et c'est là que
       * Resend dit combien attendre (`retry-after`).
       */
      headers?: Record<string, string> | null;
    }>;
  };
}

export interface ResendMailerDeps<M extends TemplateMap> {
  readonly client: ResendLike;
  readonly registry: TemplateRegistry<M>;
  readonly fromAddress: string;
  readonly replyTo?: string | null;
  readonly logger?: MailerLogger;
  /**
   * L'attente entre deux essais, injectable : un test ne doit pas attendre
   * pour de vrai ce que Resend lui demande.
   */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** L'attente réelle. */
function sleepFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Adaptateur réel — rend le gabarit (fonction pure) puis remet
 * `{ from, to, subject, html }` à Resend.
 *
 * Toute panne, qu'elle vienne du réseau (le SDK jette) ou du fournisseur (il
 * répond `error`), sort sous **une seule forme** : `MailerSendError`. L'appelant
 * n'a donc qu'un cas à traiter, et le détail fournisseur reste dans le journal
 * — jamais dans une réponse HTTP.
 *
 * **Un refus de cadence (429) se retente** (2026-10-07) : depuis que les
 * courriels de fond partent après la validation de leur transaction, plusieurs
 * envois d'un même balayage frappent Resend en même temps. L'adaptateur attend
 * ce que Resend demande (`Retry-After`, plafonné à trente secondes, une
 * seconde à défaut), au plus trois essais en tout, puis lève comme pour tout
 * refus — une `MailerRateLimitedError`, que le disjoncteur ne compte pas.
 *
 * Un 429 de QUOTA (`daily_quota_exceeded`, `monthly_quota_exceeded`) ne se
 * retente pas et lève tout de suite une `MailerSendError` ordinaire
 * (2026-10-07) : un quota épuisé ne se résout pas en trente secondes, un
 * envoi qu'une requête HTTP attend — l'invitation d'un membre du staff — ne
 * doit pas tenir une minute, et ce refus durera : le disjoncteur doit le
 * compter.
 */
export class ResendMailer<M extends TemplateMap> implements Mailer<M> {
  readonly enabled = true;
  private readonly log: MailerLogger;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: ResendMailerDeps<M>) {
    this.log = deps.logger ?? silentLogger;
    this.sleep = deps.sleep ?? sleepFor;
  }

  async send<K extends keyof M>(args: SendMailArgs<M, K>): Promise<MailReceipt> {
    const rendered = this.deps.registry[args.template](args.data);
    const context = { template: String(args.template), to: args.to };
    const result = await this.dispatchPaced(
      this.payloadOf(args, rendered),
      args.idempotencyKey,
      context,
    );

    if (result.error !== null) {
      const { message, name, statusCode } = result.error;
      this.log.error("Envoi Resend refusé", {
        ...context,
        providerStatus: statusCode ?? null,
        providerError: name ?? null,
        providerMessage: message,
      });
      const refusal = `Resend a refusé l'envoi : ${message}`;
      throw isRateLimited(result.error)
        ? new MailerRateLimitedError(refusal)
        : new MailerSendError(refusal);
    }
    const providerId = result.data?.id ?? null;
    this.log.info("E-mail envoyé", { ...context, providerId });
    // L'identifiant remonte à l'appelant : c'est la seule clé qui reliera cet
    // envoi aux événements qui le suivront. Le journaliser sans le rendre,
    // c'était l'écrire là où personne ne peut le joindre.
    return { providerId };
  }

  /** Ce qu'on remet à Resend : le gabarit rendu, l'expéditeur, les pièces. */
  private payloadOf<K extends keyof M>(
    args: SendMailArgs<M, K>,
    rendered: RenderedMail,
  ): Parameters<ResendLike["emails"]["send"]>[0] {
    const { subject, html, attachments } = rendered;
    const replyTo = this.deps.replyTo ?? null;
    return {
      from: this.deps.fromAddress,
      to: args.to,
      subject,
      html,
      ...(replyTo !== null ? { replyTo } : {}),
      ...(args.headers !== undefined ? { headers: { ...args.headers } } : {}),
      ...(attachments === undefined || attachments.length === 0
        ? {}
        : {
            attachments: attachments.map((file) => ({
              filename: file.filename,
              content: file.contentBase64,
              ...(file.contentType === undefined ? {} : { contentType: file.contentType }),
              ...(file.contentId === undefined ? {} : { contentId: file.contentId }),
            })),
          }),
    };
  }

  /**
   * L'appel, repris tant que Resend demande de ralentir : le même envoi, avec
   * la même clé d'idempotence quand l'appelant en donne une — un 429 n'a rien
   * accepté. Rend la dernière réponse, refus compris.
   */
  private async dispatchPaced(
    payload: Parameters<ResendLike["emails"]["send"]>[0],
    idempotencyKey: string | undefined,
    context: Readonly<Record<string, unknown>>,
  ): Promise<Awaited<ReturnType<ResendLike["emails"]["send"]>>> {
    let result = await this.dispatch(payload, idempotencyKey, context);
    for (
      let attempt = 1;
      attempt < MAX_ATTEMPTS_WHEN_RATE_LIMITED && isRateLimited(result.error);
      attempt += 1
    ) {
      const waitMs = retryAfterMs(result.headers);
      this.log.warn("Resend demande de ralentir : nouvel essai", { ...context, attempt, waitMs });
      await this.sleep(waitMs);
      result = await this.dispatch(payload, idempotencyKey, context);
    }
    return result;
  }

  /** L'appel au SDK, isolé pour que la panne réseau et le refus se traitent pareil. */
  private async dispatch(
    payload: Parameters<ResendLike["emails"]["send"]>[0],
    idempotencyKey: string | undefined,
    context: Readonly<Record<string, unknown>>,
  ): Promise<Awaited<ReturnType<ResendLike["emails"]["send"]>>> {
    // On transmet la clé d'idempotence : une reprise du MÊME envoi (relance
    // après un délai d'attente que Resend avait en fait accepté) est dédoublonnée
    // chez lui, et le destinataire ne reçoit pas deux fois le même e-mail.
    const options = idempotencyKey !== undefined ? { idempotencyKey } : undefined;
    try {
      return await this.deps.client.emails.send(payload, options);
    } catch (error) {
      this.log.error("Envoi Resend en échec (réseau)", context);
      throw new MailerSendError("Le fournisseur d'e-mail est injoignable.", error);
    }
  }
}

/** Le refus de Resend tel que le SDK le rend. */
type ResendRefusal = NonNullable<Awaited<ReturnType<ResendLike["emails"]["send"]>>["error"]>;

/** Un refus de cadence : un 429 qui n'est pas un quota épuisé. */
function isRateLimited(error: ResendRefusal | null): boolean {
  return (
    error !== null &&
    error.statusCode === RATE_LIMITED_STATUS &&
    !QUOTA_EXHAUSTED.has(error.name ?? "")
  );
}

/**
 * `Retry-After` en millisecondes : des secondes, plafonnées à trente ; une
 * seconde quand l'en-tête manque ou ne se lit pas comme des secondes (une
 * date HTTP, par exemple).
 */
function retryAfterMs(headers: Readonly<Record<string, string>> | null | undefined): number {
  const raw = headers?.["retry-after"]?.trim() ?? "";
  const seconds = raw === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_RETRY_AFTER_MS;
  }
  return Math.min(seconds * MS_PER_SECOND, MAX_RETRY_AFTER_MS);
}

/**
 * Fabrique le client Resend et l'expose sous notre contrat étroit. Le SDK
 * publie des types plus riches que ce qu'on utilise ; la surcharge déclare la
 * signature publique (`ResendLike`) sans assertion de type.
 */
function resendClient(apiKey: string): ResendLike;
function resendClient(apiKey: string): object {
  return new Resend(apiKey);
}

/**
 * Le chemin normal d'une app : une clé, une adresse d'expédition, un registre.
 *
 * Passer par une fabrique laisse le câblage du module à une ligne, et laisse un
 * test injecter son propre `ResendLike` via le constructeur.
 */
export function createResendMailer<M extends TemplateMap>(config: {
  apiKey: string;
  registry: TemplateRegistry<M>;
  fromAddress: string;
  replyTo?: string | null;
  logger?: MailerLogger;
}): ResendMailer<M> {
  return new ResendMailer<M>({
    client: resendClient(config.apiKey),
    registry: config.registry,
    fromAddress: config.fromAddress,
    replyTo: config.replyTo ?? null,
    ...(config.logger !== undefined ? { logger: config.logger } : {}),
  });
}
