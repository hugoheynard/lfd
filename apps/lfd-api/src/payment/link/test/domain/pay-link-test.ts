import { PAY_LINK_TEST_DAILY_LIMIT } from "@lfd/contracts";

import {
  InvalidPayLinkTestError,
  PayLinkTestDailyLimitError,
} from "./errors/pay-link-test-errors.js";

/** Le montant d'un essai, en centimes : 1 €. La base le tient aussi (`pay_link_test_amount_fixed`). */
export const PAY_LINK_TEST_AMOUNT_CENTS = 100;

/** Combien de temps un essai envoyé se paie : 24 heures. */
export const PAY_LINK_TEST_PAYABLE_MS = 24 * 60 * 60 * 1000;

/** Les états rangés. « Expiré » n'en est pas un : il se calcule ({@link PayLinkTest.isExpiredAt}). */
export const PAY_LINK_TEST_STATES = ["sent", "paid", "refunded", "refund_failed"] as const;
export type PayLinkTestState = (typeof PAY_LINK_TEST_STATES)[number];

/** La ligne telle que la persistance la lit et l'écrit — primitives seulement. */
export interface PayLinkTestSnapshot {
  readonly id: string;
  readonly amountCents: number;
  readonly state: PayLinkTestState;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly paidAt: Date | null;
  readonly refundedAt: Date | null;
}

/** Ce que l'encaissement a fait de l'essai : franchi, ou déjà payé (le même paiement rejoué). */
export type PayLinkTestPayment = "applied" | "already_applied";

/** Vrai si `raw` est un état rangé. */
export function isPayLinkTestState(raw: string): raw is PayLinkTestState {
  return PAY_LINK_TEST_STATES.some((state) => state === raw);
}

/**
 * **Le plafond du jour** : refuse un essai de plus quand `sentToday` essais
 * ont déjà été envoyés ce jour de Paris. Le compte est pris sous le verrou de
 * l'envoi, dans la transaction qui écrira l'essai.
 *
 * @throws {PayLinkTestDailyLimitError} le plafond est atteint.
 */
export function assertDailyRoom(sentToday: number): void {
  if (sentToday >= PAY_LINK_TEST_DAILY_LIMIT) {
    throw new PayLinkTestDailyLimitError(PAY_LINK_TEST_DAILY_LIMIT);
  }
}

/**
 * **Un essai du paiement par lien** (doc
 * `documentation/payment/les-liens-de-paiement.md`, « Le lien d'essai ») :
 * envoyé, payé une fois, puis remboursé — ou en échec de remboursement, que
 * l'équipe voit sonner. Le montant n'a pas de mutateur : il vaut 1 €.
 */
export class PayLinkTest {
  private constructor(private snapshot: PayLinkTestSnapshot) {}

  /** **Envoie** un essai neuf. @throws {InvalidPayLinkTestError} auteur vide. */
  static send(input: { id: string; createdAt: Date; createdByStaffId: string }): PayLinkTest {
    if (input.createdByStaffId.trim() === "") {
      throw new InvalidPayLinkTestError("l'auteur est vide");
    }
    return new PayLinkTest({
      id: input.id,
      amountCents: PAY_LINK_TEST_AMOUNT_CENTS,
      state: "sent",
      createdAt: input.createdAt,
      createdByStaffId: input.createdByStaffId,
      paidAt: null,
      refundedAt: null,
    });
  }

  /**
   * Relit une ligne : elle revalide ce que la base garantit déjà.
   * @throws {InvalidPayLinkTestError} montant autre que 1 €, ou instants incohérents.
   */
  static rehydrate(snapshot: PayLinkTestSnapshot): PayLinkTest {
    if (snapshot.amountCents !== PAY_LINK_TEST_AMOUNT_CENTS) {
      throw new InvalidPayLinkTestError(`le montant vaut ${String(snapshot.amountCents)} centimes`);
    }
    if ((snapshot.state === "sent") !== (snapshot.paidAt === null)) {
      throw new InvalidPayLinkTestError("l'instant du paiement ne suit pas l'état");
    }
    if ((snapshot.state === "refunded") !== (snapshot.refundedAt !== null)) {
      throw new InvalidPayLinkTestError("l'instant du remboursement ne suit pas l'état");
    }
    return new PayLinkTest(snapshot);
  }

  get id(): string {
    return this.snapshot.id;
  }

  get state(): PayLinkTestState {
    return this.snapshot.state;
  }

  get createdAt(): Date {
    return this.snapshot.createdAt;
  }

  get createdByStaffId(): string {
    return this.snapshot.createdByStaffId;
  }

  get paidAt(): Date | null {
    return this.snapshot.paidAt;
  }

  get refundedAt(): Date | null {
    return this.snapshot.refundedAt;
  }

  /** Plus de 24 heures depuis l'envoi : la page ne le propose plus. */
  isPastWindowAt(now: Date): boolean {
    return now.getTime() - this.snapshot.createdAt.getTime() >= PAY_LINK_TEST_PAYABLE_MS;
  }

  /** Se paie encore : envoyé, jamais payé, et dans ses 24 heures. */
  isPayableAt(now: Date): boolean {
    return this.snapshot.state === "sent" && !this.isPastWindowAt(now);
  }

  /** « Expiré », calculé : envoyé, jamais payé, et ses 24 heures passées. */
  isExpiredAt(now: Date): boolean {
    return this.snapshot.state === "sent" && this.isPastWindowAt(now);
  }

  /**
   * **L'euro est encaissé.** La première fois, l'essai passe payé ; ensuite
   * le même paiement rejoué ne change rien. Un essai payé après ses 24 heures
   * (une page ouverte à temps) l'est aussi : l'argent est là, il sera rendu.
   */
  markPaid(at: Date): PayLinkTestPayment {
    if (this.snapshot.state !== "sent") {
      return "already_applied";
    }
    this.snapshot = { ...this.snapshot, state: "paid", paidAt: at };
    return "applied";
  }

  /**
   * **L'euro est rendu**, issue terminale réussie. Sans effet sur un essai
   * déjà remboursé ; refusé sur un essai jamais payé.
   *
   * @throws {InvalidPayLinkTestError} l'essai n'a pas été payé.
   */
  markRefunded(at: Date): boolean {
    if (this.snapshot.state === "refunded") {
      return false;
    }
    if (this.snapshot.state === "sent") {
      throw new InvalidPayLinkTestError("un essai jamais payé ne se rembourse pas");
    }
    this.snapshot = { ...this.snapshot, state: "refunded", refundedAt: at };
    return true;
  }

  /**
   * **Le remboursement n'a pas rendu l'euro** — ou un euro rendu est revenu.
   * Rend `false` quand l'essai est déjà dit en échec.
   *
   * @throws {InvalidPayLinkTestError} l'essai n'a pas été payé.
   */
  markRefundFailed(): boolean {
    if (this.snapshot.state === "refund_failed") {
      return false;
    }
    if (this.snapshot.state === "sent") {
      throw new InvalidPayLinkTestError("un essai jamais payé n'a pas de remboursement");
    }
    this.snapshot = { ...this.snapshot, state: "refund_failed", refundedAt: null };
    return true;
  }

  toPersistence(): PayLinkTestSnapshot {
    return this.snapshot;
  }
}
