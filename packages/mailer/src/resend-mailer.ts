import { Resend } from "resend";

import { MailerSendError } from "./errors.js";
import { silentLogger } from "./types.js";
import type { Mailer, MailerLogger, SendMailArgs, TemplateMap, TemplateRegistry } from "./types.js";

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
      },
      options?: { idempotencyKey?: string },
    ) => Promise<{
      data: { id: string } | null;
      error: { message: string; name?: string; statusCode?: number | null } | null;
    }>;
  };
}

export interface ResendMailerDeps<M extends TemplateMap> {
  readonly client: ResendLike;
  readonly registry: TemplateRegistry<M>;
  readonly fromAddress: string;
  readonly replyTo?: string | null;
  readonly logger?: MailerLogger;
}

/**
 * Adaptateur réel — rend le gabarit (fonction pure) puis remet
 * `{ from, to, subject, html }` à Resend.
 *
 * Toute panne, qu'elle vienne du réseau (le SDK jette) ou du fournisseur (il
 * répond `error`), sort sous **une seule forme** : `MailerSendError`. L'appelant
 * n'a donc qu'un cas à traiter, et le détail fournisseur reste dans le journal
 * — jamais dans une réponse HTTP.
 */
export class ResendMailer<M extends TemplateMap> implements Mailer<M> {
  readonly enabled = true;
  private readonly log: MailerLogger;

  constructor(private readonly deps: ResendMailerDeps<M>) {
    this.log = deps.logger ?? silentLogger;
  }

  async send<K extends keyof M>(args: SendMailArgs<M, K>): Promise<void> {
    const { subject, html } = this.deps.registry[args.template](args.data);
    const context = { template: String(args.template), to: args.to };
    const replyTo = this.deps.replyTo ?? null;

    const result = await this.dispatch(
      {
        from: this.deps.fromAddress,
        to: args.to,
        subject,
        html,
        ...(replyTo !== null ? { replyTo } : {}),
        ...(args.headers !== undefined ? { headers: { ...args.headers } } : {}),
      },
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
      throw new MailerSendError(`Resend a refusé l'envoi : ${message}`);
    }
    this.log.info("E-mail envoyé", { ...context, providerId: result.data?.id ?? null });
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
