import type { PaymentLinkStatus } from "@lfd/contracts";

import { PaymentLinkNotOpenError } from "../errors/payment-link-errors.js";
import { PaymentLinkTerms } from "../value-objects/payment-link-terms.js";

/** La session Stripe hébergée derrière un lien : la clé de rapprochement et l'URL. */
export interface CheckoutSession {
  /** `cs_…`, unique. */
  readonly sessionId: string;
  readonly url: string;
}

/** L'agrégat tel que la base le range. */
export interface PaymentLinkSnapshot {
  readonly id: string;
  readonly companyId: string;
  readonly amountCents: number;
  readonly label: string;
  readonly status: PaymentLinkStatus;
  readonly stripeSessionId: string;
  readonly url: string;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
}

/** Ce qu'il faut pour ouvrir un lien. */
export interface PaymentLinkOpening {
  readonly id: string;
  readonly companyId: string;
  readonly terms: PaymentLinkTerms;
  readonly checkout: CheckoutSession;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
}

/**
 * L'issue d'un paiement confirmé par Stripe :
 * - `settled` — le lien passe à `paid` ;
 * - `settled_after_cancel` — il était annulé : il passe QUAND MÊME à `paid`
 *   (l'argent est encaissé, le nier serait pire), et l'équipe doit l'apprendre ;
 * - `already_paid` — webhook rejoué, rien ne bouge.
 */
export type PaymentLinkSettlement = "settled" | "settled_after_cancel" | "already_paid";

/**
 * **Un lien de paiement libre** — une somme demandée à un client hors de toute
 * commande, encaissée par Stripe Checkout hébergé (plan
 * `plan-blocage-prelevement-et-liens-de-paiement.md` §2b).
 *
 * `open` est le seul état dont on sort par un geste ; les trois autres sont
 * terminaux, à une exception près, écrite dans {@link markPaid}.
 */
export class PaymentLink {
  private constructor(
    readonly id: string,
    readonly companyId: string,
    readonly terms: PaymentLinkTerms,
    readonly checkout: CheckoutSession,
    readonly createdAt: Date,
    readonly createdByStaffId: string,
    private statusValue: PaymentLinkStatus,
    private paidAtValue: Date | null,
    private cancelledAtValue: Date | null,
    private cancelledByValue: string | null,
  ) {}

  /** Un lien neuf, ouvert. Les termes ont déjà passé le plafond. */
  static create(opening: PaymentLinkOpening): PaymentLink {
    return new PaymentLink(
      opening.id,
      opening.companyId,
      opening.terms,
      opening.checkout,
      opening.createdAt,
      opening.createdByStaffId,
      "open",
      null,
      null,
      null,
    );
  }

  /** Ligne → agrégat. Les termes revalident, sans le plafond du jour. */
  static reconstitute(snapshot: PaymentLinkSnapshot): PaymentLink {
    return new PaymentLink(
      snapshot.id,
      snapshot.companyId,
      PaymentLinkTerms.reconstitute(snapshot.amountCents, snapshot.label),
      { sessionId: snapshot.stripeSessionId, url: snapshot.url },
      snapshot.createdAt,
      snapshot.createdByStaffId,
      snapshot.status,
      snapshot.paidAt,
      snapshot.cancelledAt,
      snapshot.cancelledByStaffId,
    );
  }

  get status(): PaymentLinkStatus {
    return this.statusValue;
  }

  /**
   * Stripe a encaissé. Idempotent sur un lien déjà payé.
   *
   * 🔴 Un lien **annulé** passe quand même à `paid` : l'annulation a perdu la
   * course chez Stripe, l'argent est là, et une ligne qui dirait « annulé » sur
   * une somme encaissée mentirait à la comptabilité. L'annulation reste datée
   * et signée — c'est ce qui permet de dire les deux.
   */
  markPaid(at: Date): PaymentLinkSettlement {
    if (this.statusValue === "paid") {
      return "already_paid";
    }
    const wasCancelled = this.statusValue === "cancelled";
    this.statusValue = "paid";
    this.paidAtValue = at;
    return wasCancelled ? "settled_after_cancel" : "settled";
  }

  /**
   * Le staff retire le lien. Depuis `open` seulement.
   * @throws {PaymentLinkNotOpenError} déjà payé, annulé ou expiré.
   */
  cancel(at: Date, byStaffId: string): void {
    if (this.statusValue !== "open") {
      throw new PaymentLinkNotOpenError(this.statusValue);
    }
    this.statusValue = "cancelled";
    this.cancelledAtValue = at;
    this.cancelledByValue = byStaffId;
  }

  /**
   * Stripe a laissé la session mourir. Sans effet hors de `open` : un
   * `expired` qui suit notre annulation (on expire la session nous-mêmes) ou un
   * paiement n'a rien à réécrire.
   *
   * @returns `true` si le lien vient d'expirer.
   */
  expire(): boolean {
    if (this.statusValue !== "open") {
      return false;
    }
    this.statusValue = "expired";
    return true;
  }

  toPersistence(): PaymentLinkSnapshot {
    return {
      id: this.id,
      companyId: this.companyId,
      amountCents: this.terms.amountCents,
      label: this.terms.label,
      status: this.statusValue,
      stripeSessionId: this.checkout.sessionId,
      url: this.checkout.url,
      createdAt: this.createdAt,
      createdByStaffId: this.createdByStaffId,
      paidAt: this.paidAtValue,
      cancelledAt: this.cancelledAtValue,
      cancelledByStaffId: this.cancelledByValue,
    };
  }
}
