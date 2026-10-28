/**
 * Range une réponse reçue par e-mail, désignée par son identifiant Resend
 * (plan `plan-reponses-par-e-mail.md`, R2). Le message est relu chez Resend
 * par le handler : le webhook n'en porte que l'identifiant.
 */
export class ReceiveEmailReplyCommand {
  constructor(readonly emailId: string) {}
}
