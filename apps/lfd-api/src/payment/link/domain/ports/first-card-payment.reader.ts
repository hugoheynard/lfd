/** Le premier paiement d'un sujet, tel que la page d'un lien le relit. */
export interface FirstCardPayment {
  readonly paymentId: string;
  readonly amountCents: number;
}

/**
 * **« Ce sujet a-t-il déjà son premier paiement ? »** — l'index
 * `payment_first_per_subject_key` n'en admet qu'un, quel que soit son état :
 * la page d'un lien relit celui-là plutôt que d'en créer un second.
 */
export abstract class FirstCardPaymentReader {
  abstract firstOf(subjectType: string, subjectId: string): Promise<FirstCardPayment | null>;
}
