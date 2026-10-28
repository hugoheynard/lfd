import type { ReceivedMail } from "@lfd/mailer";

/**
 * **Le lecteur technique d'un e-mail reçu** (plan
 * `plan-reponses-par-e-mail.md`, §3) — l'API de réception de Resend, derrière
 * un port pour que le contexte qui range le message ne connaisse pas le
 * fournisseur, et qu'un test le double.
 *
 * @throws {InboundMailUnreadableError} le message ne se lit pas (réseau,
 *   introuvable, pas de clé) : l'appelant le laisse remonter, Resend rejoue.
 */
export abstract class InboundMailReader {
  abstract read(emailId: string): Promise<ReceivedMail>;
}
