/**
 * **Un e-mail est arrivé** — ce que le webhook Resend sait d'un message reçu
 * (`email.received`) avant de le lire : son identifiant chez Resend.
 */
export interface InboundMailNotice {
  /** L'identifiant Resend du message reçu (`data.email_id`). */
  readonly emailId: string;
}

/**
 * **Le port où la plateforme dépose un e-mail reçu** (plan
 * `documentation/demandes-client/plan-reponses-par-e-mail.md`, §3).
 *
 * `platform` ne connaît pas les demandes clients : il DÉCLARE ce port, le
 * commerce l'implémente (`b2b/contact`), et `appBootstrap` les relie.
 * L'appel est SYNCHRONE : un rangement qui échoue doit lever, pour que le
 * webhook échoue et que Resend le rejoue. L'implémentation est idempotente
 * sur `emailId` — un rejeu après succès ne range rien de plus.
 */
export abstract class InboundMailSink {
  abstract accept(notice: InboundMailNotice): Promise<void>;
}
