import {
  CardPaymentTransitionRefusedError,
  InvalidPaymentAmountError,
  MissingProviderRefError,
} from "../errors/card-payment-errors.js";
import {
  type CardPaymentRole,
  type CardPaymentState,
  isCardPaymentTransition,
} from "../value-objects/card-payment-state.js";
import { PaymentAccount } from "../value-objects/payment-account.js";
import { PaymentSubject } from "../value-objects/payment-subject.js";

/** La ligne telle que la persistance la lit et l'écrit — primitives seulement. */
export interface CardPaymentSnapshot {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly account: string;
  readonly providerRef: string | null;
  readonly role: CardPaymentRole;
  readonly amountCents: number;
  readonly state: CardPaymentState;
  readonly createdAt: Date;
  readonly paidAt: Date | null;
}

/** Ce qu'il faut pour rattacher une intention à son sujet. */
export interface CardPaymentAttachment {
  readonly id: string;
  readonly subject: PaymentSubject;
  readonly account: PaymentAccount;
  readonly providerRef: string;
  readonly role: CardPaymentRole;
  readonly amountCents: number;
  readonly at: Date;
}

/**
 * Où en est un paiement par rapport à un état visé :
 * - `transition` — l'une des six transitions du §3.4 y mène ;
 * - `replay` — il y est déjà (`(x, x)`) : rien à écrire ;
 * - `refused` — aucune transition n'y mène : un événement périmé, ou un écart.
 */
export type CardPaymentMove = "transition" | "replay" | "refused";

/** L'issue d'un rattrapage (`ReplayFirstPayments`, §4.3). */
export type CardPaymentCatchUp = "advanced" | "in_step" | "diverged";

/**
 * **Un paiement par carte d'un sujet** (plan M2, §3.4, §4.3) — l'agrégat
 * qui porte la machine `payment.state`.
 *
 * Les colonnes que le déclencheur `payment_guard` tient immuables (sujet,
 * compte, rôle, montant, référence posée) n'ont ici AUCUN mutateur : la règle
 * est structurelle avant d'être refusée en base. Seuls l'état et l'instant
 * d'encaissement bougent, et seulement par les six transitions.
 */
export class CardPayment {
  private constructor(
    readonly id: string,
    readonly subject: PaymentSubject,
    readonly account: PaymentAccount,
    readonly providerRef: string | null,
    readonly role: CardPaymentRole,
    readonly amountCents: number,
    readonly createdAt: Date,
    private currentState: CardPaymentState,
    private currentPaidAt: Date | null,
  ) {}

  /**
   * **Rattache** une intention créée chez le prestataire à son sujet : la
   * ligne naît `pending`, dans la transaction de l'appelant (§3.3).
   *
   * @throws {InvalidPaymentAmountError} montant non entier ou ≤ 0.
   * @throws {MissingProviderRefError} référence vide.
   */
  static attach(input: CardPaymentAttachment): CardPayment {
    return CardPayment.born(input, "pending");
  }

  /**
   * **Adopte** un paiement que la ligne ne connaissait pas — une intention
   * créée par l'image d'avant le bloc (§4.6) — à l'état que son sujet déclare.
   * Encaissé, son instant d'encaissement est celui de l'adoption : le sujet
   * ne le transmet pas.
   *
   * @throws {InvalidPaymentAmountError} montant non entier ou ≤ 0.
   * @throws {MissingProviderRefError} référence vide.
   */
  static adopt(input: CardPaymentAttachment, settled: CardPaymentState): CardPayment {
    return CardPayment.born(input, settled);
  }

  /** Relit une ligne ; ses invariants de forme sont revérifiés. */
  static rehydrate(row: CardPaymentSnapshot): CardPayment {
    assertAmount(row.amountCents);
    return new CardPayment(
      row.id,
      PaymentSubject.of(row.subjectType, row.subjectId),
      PaymentAccount.of(row.account),
      row.providerRef,
      row.role,
      row.amountCents,
      row.createdAt,
      row.state,
      row.paidAt,
    );
  }

  private static born(input: CardPaymentAttachment, state: CardPaymentState): CardPayment {
    assertAmount(input.amountCents);
    if (input.providerRef.trim() === "") {
      throw new MissingProviderRefError();
    }
    return new CardPayment(
      input.id,
      input.subject,
      input.account,
      input.providerRef,
      input.role,
      input.amountCents,
      input.at,
      state,
      state === "paid" ? input.at : null,
    );
  }

  get state(): CardPaymentState {
    return this.currentState;
  }

  get paidAt(): Date | null {
    return this.currentPaidAt;
  }

  /** Ce que vaudrait un passage à `target`, sans rien changer. */
  moveTo(target: CardPaymentState): CardPaymentMove {
    if (this.currentState === target) {
      return "replay";
    }
    return isCardPaymentTransition(this.currentState, target) ? "transition" : "refused";
  }

  /**
   * **Encaissé.** Admis depuis tout état (`closed → paid` compris : l'argent
   * est là, et c'est au sujet de demander le remboursement). Rend `false` sur
   * un rejeu : déjà encaissé, rien n'est écrit.
   */
  markPaid(at: Date): boolean {
    if (this.moveTo("paid") === "replay") {
      return false;
    }
    this.currentState = "paid";
    this.currentPaidAt = at;
    return true;
  }

  /**
   * **Refusé par la banque.** Rend `false` sur un rejeu.
   *
   * @throws {CardPaymentTransitionRefusedError} encaissé ou fermé : un refus
   *   n'y ramène pas — l'appelant ignore l'événement périmé AVANT (§3.4).
   */
  markFailed(): boolean {
    return this.move("failed");
  }

  /**
   * **Fermé** (abandon, clôture). Rend `false` s'il l'était déjà.
   *
   * @throws {CardPaymentTransitionRefusedError} encaissé : l'argent est là,
   *   il se rend par un remboursement, jamais par une fermeture.
   */
  close(): boolean {
    return this.move("closed");
  }

  /**
   * **Rattrape** l'état que le sujet déclare (§4.3), en avant seulement :
   * une transition de la machine, ou rien. Un état qu'aucune transition
   * n'atteint est un écart, jamais un retour en arrière.
   */
  catchUp(target: CardPaymentState, at: Date): CardPaymentCatchUp {
    const move = this.moveTo(target);
    if (move === "replay") {
      return "in_step";
    }
    if (move === "refused") {
      return "diverged";
    }
    if (target === "paid") {
      this.markPaid(at);
    } else {
      this.currentState = target;
    }
    return "advanced";
  }

  toPersistence(): CardPaymentSnapshot {
    return {
      id: this.id,
      subjectType: this.subject.type,
      subjectId: this.subject.id,
      account: this.account.name,
      providerRef: this.providerRef,
      role: this.role,
      amountCents: this.amountCents,
      state: this.currentState,
      createdAt: this.createdAt,
      paidAt: this.currentPaidAt,
    };
  }

  private move(target: "failed" | "closed"): boolean {
    const move = this.moveTo(target);
    if (move === "replay") {
      return false;
    }
    if (move === "refused") {
      throw new CardPaymentTransitionRefusedError(this.id, this.currentState, target);
    }
    this.currentState = target;
    return true;
  }
}

function assertAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new InvalidPaymentAmountError(amountCents);
  }
}
