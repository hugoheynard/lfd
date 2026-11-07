/**
 * Port : **les domaines vérifiés chez Resend** (plan
 * `plan-editeur-par-blocs.md`, § 25, C3) — un compte, plusieurs domaines.
 * C'est un appel réseau : jamais dans une transaction.
 */
export abstract class VerifiedSendingDomains {
  /**
   * Les noms des domaines dont Resend accepte l'envoi, en minuscules.
   *
   * @throws {SendingDomainsUnavailableError} la liste n'a pas pu être lue
   *   (pas de clé, clé sans droit de lecture, Resend injoignable).
   */
  abstract verified(): Promise<readonly string[]>;
}
