import type { CardPayment } from "../entities/card-payment.js";
import type { PaymentAccount } from "../value-objects/payment-account.js";

/**
 * **Le port d'écriture des paiements** (plan M2, §3.4, §4.3) : il prend et
 * rend l'agrégat ; aucune écriture ciblée d'une colonne.
 *
 * La lecture des positions par sujet n'est PAS ici : c'est un port à part
 * (`CardSettlementReader`, du canal), que ses consommateurs lisent sans
 * pouvoir écrire (ISP, `CLAUDE.md` § 2).
 */
export abstract class CardPaymentRepository {
  /**
   * Charge le paiement **sous verrou** (`FOR UPDATE`) quand une transaction
   * est ouverte : la relecture du §3.6, après l'appel au canal.
   */
  abstract load(paymentId: string): Promise<CardPayment | null>;

  /** Le paiement de cette intention, sans verrou. `(compte, référence)` est unique. */
  abstract findByProviderRef(
    account: PaymentAccount,
    providerRef: string,
  ): Promise<CardPayment | null>;

  /**
   * Les paiements `pending | failed` d'un type de sujet rattachés avant
   * `before` — la borne des vieux impayés que le rattrapage relit un par un
   * (§4.3, et le verdict du §15 ter : « un `claim` par ligne »).
   */
  abstract unsettledCreatedBefore(
    subjectType: string,
    before: Date,
  ): Promise<readonly CardPayment[]>;

  /**
   * Écrit une ligne NEUVE si ni son identifiant, ni sa référence, ni (pour un
   * `first`) son sujet ne sont déjà pris — sans erreur qui annulerait la
   * transaction de l'appelant. Rend `true` si elle a été écrite.
   */
  abstract addIfAbsent(payment: CardPayment): Promise<boolean>;

  /** Écrit l'agrégat : la ligne neuve, ou son état et son instant d'encaissement. */
  abstract save(payment: CardPayment): Promise<void>;
}
