import { InvalidPaymentSubjectError } from "../errors/card-payment-errors.js";

/** `order`, `revision_proposal`… : un mot en minuscules, des soulignés admis. */
const SUBJECT_TYPE = /^[a-z][a-z_]*$/u;

/**
 * **Ce pour quoi un paiement est encaissé** — `(subject_type, subject_id)`,
 * opaques pour le bloc (plan M2, §3.1). Le bloc ne sait pas ce qu'est une
 * commande : il sait qu'un sujet de type `order` porte cet identifiant, et
 * qu'un implémenteur du canal des sujets en répond.
 */
export class PaymentSubject {
  private constructor(
    readonly type: string,
    readonly id: string,
  ) {}

  /** @throws {InvalidPaymentSubjectError} type mal formé ou identifiant vide. */
  static of(type: string, id: string): PaymentSubject {
    if (!SUBJECT_TYPE.test(type) || id.trim() === "") {
      throw new InvalidPaymentSubjectError(type, id);
    }
    return new PaymentSubject(type, id);
  }

  equals(other: PaymentSubject): boolean {
    return this.type === other.type && this.id === other.id;
  }

  /** `order:ord_1` — pour un journal ou une clé, jamais pour un écran. */
  toString(): string {
    return `${this.type}:${this.id}`;
  }
}
