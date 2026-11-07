import type { MailSenderIdentity, MailSpace } from "@lfd/mail-blocks";

/**
 * Port : **l'essai d'une identité d'envoi** (plan
 * `plan-editeur-par-blocs.md`, § 25, C3) — un e-mail réel, envoyé tout de
 * suite à l'auteur sous l'identité proposée, avant de l'enregistrer.
 * Jamais dans une transaction : on attend la réponse de Resend.
 */
export abstract class MailSenderTrial {
  /**
   * @param intentKey la clé d'intention de l'écran : un double clic n'envoie qu'un essai.
   * @throws {MailSenderTrialRefusedError} Resend a refusé l'envoi.
   */
  abstract send(
    space: MailSpace,
    identity: MailSenderIdentity,
    to: string,
    intentKey: string,
  ): Promise<void>;
}
