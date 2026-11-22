import { InvalidPaymentAccountError } from "../errors/card-payment-errors.js";

/** `lfc-stripe`, `lfc-caisse-epargne` : minuscules et chiffres, séparés par des tirets. */
const ACCOUNT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * **Le compte d'encaissement** d'un paiement (plan M2, §3.2) — persisté sur la
 * ligne : relire, annuler, rembourser lisent le compte SUR LA LIGNE, jamais un
 * défaut.
 *
 * Le domaine n'en vérifie que la forme. Qu'il soit au registre est l'affaire
 * de `CardProviders` (`UnknownCardAccountError`), et de la base (`CHECK
 * payment_account_known`) : le registre vit dans `platform/config/`, que le
 * domaine ne lit pas.
 */
export class PaymentAccount {
  private constructor(readonly name: string) {}

  /** @throws {InvalidPaymentAccountError} nom mal formé. */
  static of(name: string): PaymentAccount {
    if (!ACCOUNT_NAME.test(name)) {
      throw new InvalidPaymentAccountError(name);
    }
    return new PaymentAccount(name);
  }

  equals(other: PaymentAccount): boolean {
    return this.name === other.name;
  }
}
