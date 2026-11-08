/**
 * **Le registre des messages de webhook déjà vus.**
 *
 * Le journal d'`ops.mail_send` en portait aussi les envois et leurs retours ;
 * depuis T1b (`documentation/mail/le-suivi-des-e-mails.md`, règle 5), le
 * suivi du bloc `mail` les tient, et la table n'est plus écrite (elle reste
 * en base). Seul ce registre demeure, lu par `send-guest-order-notice`
 * (vérifié le 2026-11-08).
 */
export abstract class MailJournal {
  /**
   * Retient un message de webhook, et dit s'il est **nouveau**.
   *
   * Svix réessaie : le même événement arrive plusieurs fois, et le traiter deux
   * fois compterait deux rebonds pour un seul.
   *
   * ⚠️ Ce registre n'a rien de spécifiquement postal — Stripe aurait le même
   * besoin. Il vit ici tant qu'il n'a qu'un consommateur ; on le sortira au
   * SECOND, pas avant, comme tout le reste.
   */
  abstract rememberEvent(provider: string, externalId: string): Promise<boolean>;
}
