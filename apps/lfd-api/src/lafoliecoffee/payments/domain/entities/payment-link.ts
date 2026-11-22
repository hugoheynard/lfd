import type { FreeChargeNature, PaymentLinkStatus } from "@lfd/contracts";

import {
  PaymentLinkChannelCorruptError,
  PaymentLinkNotOpenError,
} from "../errors/payment-link-errors.js";
import {
  chooseFreeChargeNature,
  rehydrateFreeChargeNature,
} from "../value-objects/free-charge-nature.js";
import { PaymentLinkTerms } from "../value-objects/payment-link-terms.js";

/** La session Stripe hébergée derrière un lien : la clé de rapprochement et l'URL. */
export interface CheckoutSession {
  /** `cs_…`, unique. */
  readonly sessionId: string;
  readonly url: string;
}

/**
 * **Par où l'argent arrive** — un canal fermé :
 * - `checkout` : un lien d'avant la porte, payé sur sa page Stripe Checkout
 *   hébergée ; sa session est la clé de rapprochement du webhook ;
 * - `door` : une demande de paiement libre payée par la porte du bloc `payment` (sujet
 *   `free_charge`), sans session : son adresse est celle de son lien.
 *
 * L'expiration, la recherche par session et la fermeture de session ne
 * valent que pour `checkout`. La dualité finit quand le dernier lien
 * `checkout` est clos (lot F2 du plan du lien vers un sujet).
 */
export type PaymentLinkChannel =
  { readonly kind: "checkout"; readonly session: CheckoutSession } | { readonly kind: "door" };

/** L'agrégat tel que la base le range. */
export interface PaymentLinkSnapshot {
  readonly id: string;
  readonly companyId: string;
  readonly amountCents: number;
  readonly label: string;
  /** Clé du registre des natures ; `null` pour une demande d'avant le registre. */
  readonly nature: string | null;
  readonly status: PaymentLinkStatus;
  /** Posés ensemble (canal `checkout`) ou nuls ensemble (canal `door`). */
  readonly stripeSessionId: string | null;
  readonly url: string | null;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
}

/** Ce qu'il faut pour ouvrir un lien : il naît toujours en canal `door`. */
export interface PaymentLinkOpening {
  readonly id: string;
  readonly companyId: string;
  readonly terms: PaymentLinkTerms;
  /** La nature choisie — obligatoire à la création, refusée hors registre. */
  readonly nature: string;
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
 * **Un lien de paiement libre — la demande de paiement libre** : une somme demandée à
 * un client hors de toute commande (doc d'état `les-liens-de-paiement.md`).
 * Elle se paie par la porte du bloc `payment` ; un lien d'avant la porte
 * garde sa page Stripe Checkout ({@link PaymentLinkChannel}).
 *
 * `open` est le seul état dont on sort par un geste ; les trois autres sont
 * terminaux, à une exception près, écrite dans {@link markPaid}.
 */
export class PaymentLink {
  private constructor(
    readonly id: string,
    readonly companyId: string,
    readonly terms: PaymentLinkTerms,
    /** `null` : une demande d'avant le registre, « non précisée ». */
    readonly nature: FreeChargeNature | null,
    readonly channel: PaymentLinkChannel,
    readonly createdAt: Date,
    readonly createdByStaffId: string,
    private statusValue: PaymentLinkStatus,
    private paidAtValue: Date | null,
    private cancelledAtValue: Date | null,
    private cancelledByValue: string | null,
  ) {}

  /**
   * Un lien neuf, ouvert, payé par la porte. Les termes ont déjà passé le plafond.
   * @throws {UnknownFreeChargeNatureError} nature hors registre.
   */
  static create(opening: PaymentLinkOpening): PaymentLink {
    return new PaymentLink(
      opening.id,
      opening.companyId,
      opening.terms,
      chooseFreeChargeNature(opening.nature),
      { kind: "door" },
      opening.createdAt,
      opening.createdByStaffId,
      "open",
      null,
      null,
      null,
    );
  }

  /**
   * Ligne → agrégat. Les termes revalident, sans le plafond du jour.
   * @throws {PaymentLinkChannelCorruptError} session sans URL, ou l'inverse.
   * @throws {PaymentLinkNatureCorruptError} nature rangée hors registre.
   */
  static reconstitute(snapshot: PaymentLinkSnapshot): PaymentLink {
    return new PaymentLink(
      snapshot.id,
      snapshot.companyId,
      PaymentLinkTerms.reconstitute(snapshot.amountCents, snapshot.label),
      rehydrateFreeChargeNature(snapshot.id, snapshot.nature),
      channelOf(snapshot),
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

  /** La session Stripe à fermer ou à rapprocher — `null` pour un lien `door`. */
  get checkoutSession(): CheckoutSession | null {
    return this.channel.kind === "checkout" ? this.channel.session : null;
  }

  /** Annulée par le staff, et pas payée depuis. */
  get isCancelled(): boolean {
    return this.statusValue === "cancelled";
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
   * paiement n'a rien à réécrire. Sans effet sur un lien `door`, qui n'a pas
   * de session : une demande de paiement libre n'expire pas, elle s'annule.
   *
   * @returns `true` si le lien vient d'expirer.
   */
  expire(): boolean {
    if (this.channel.kind !== "checkout" || this.statusValue !== "open") {
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
      nature: this.nature,
      status: this.statusValue,
      stripeSessionId: this.checkoutSession?.sessionId ?? null,
      url: this.checkoutSession?.url ?? null,
      createdAt: this.createdAt,
      createdByStaffId: this.createdByStaffId,
      paidAt: this.paidAtValue,
      cancelledAt: this.cancelledAtValue,
      cancelledByStaffId: this.cancelledByValue,
    };
  }
}

/** Le canal d'une ligne : la paire posée, ou nulle — jamais à moitié (`CHECK`). */
function channelOf(snapshot: PaymentLinkSnapshot): PaymentLinkChannel {
  const { stripeSessionId, url } = snapshot;
  if (stripeSessionId === null && url === null) {
    return { kind: "door" };
  }
  if (stripeSessionId === null || url === null) {
    throw new PaymentLinkChannelCorruptError(snapshot.id);
  }
  return { kind: "checkout", session: { sessionId: stripeSessionId, url } };
}
