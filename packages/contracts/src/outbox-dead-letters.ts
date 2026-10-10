/**
 * **Un message mort** de la boîte d'envoi : un fait durable qu'UN abonné n'a
 * pas reçu après tous ses essais
 * (`documentation/journalisation/plan-boite-d-envoi.md`, §8).
 *
 * La file des messages morts vise un couple message × abonné, et elle nomme
 * l'abonné qui bloque : un fait a plusieurs abonnés, un seul peut être en
 * panne. Le corps du fait n'est PAS servi — il peut porter des identifiants
 * métier, et l'écran n'en a pas besoin pour rejouer.
 */
export interface DeadLetterView {
  /** Identifiant du fait — avec `subscriber`, la clé du rejeu. */
  readonly eventId: string;
  readonly subscriber: string;
  /** Nom stable du fait (`order.paid`). */
  readonly type: string;
  /** Clé déterministe du fait (`order.paid:<orderId>`). */
  readonly key: string;
  /** ISO 8601. */
  readonly occurredAt: string;
  readonly attempts: number;
  /** Le message de la dernière erreur de l'abonné, tel qu'il l'a levée. */
  readonly lastError: string | null;
}

/** `GET /admin/outbox/dead-letters` — les plus récents d'abord, bornés. */
export interface DeadLettersView {
  readonly letters: readonly DeadLetterView[];
  /** Vrai quand la borne a coupé la liste : il en reste d'autres. */
  readonly truncated: boolean;
}
