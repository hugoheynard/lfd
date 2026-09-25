import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { PaymentLink } from "../entities/payment-link.js";

export const PAYMENT_LINK_CREATED = "payment_link.created" satisfies JournalFactType;
export const PAYMENT_LINK_CANCELLED = "payment_link.cancelled" satisfies JournalFactType;

/**
 * Les deux gestes du staff sur un lien libre, au journal de la **société** —
 * c'est sa fiche qu'on ouvre pour demander « qui lui a demandé combien ».
 *
 * Le paiement et l'expiration n'y sont PAS : ce sont des projections d'un
 * événement Stripe, pas des actes dont un humain répond (même règle que
 * `ConfirmOrderPaymentHandler`).
 */
abstract class PaymentLinkStaffAct implements JournaledEvent {
  protected constructor(
    private readonly type: typeof PAYMENT_LINK_CREATED | typeof PAYMENT_LINK_CANCELLED,
    readonly link: PaymentLink,
    readonly companyName: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: this.type,
      subjectType: "company",
      subjectId: this.link.companyId,
      payload: {
        subjectLabel: this.companyName,
        paymentLink: { id: this.link.id, name: this.link.terms.label },
        amountCents: this.link.terms.amountCents,
      },
    };
  }
}

export class PaymentLinkCreatedEvent extends PaymentLinkStaffAct {
  constructor(link: PaymentLink, companyName: string) {
    super(PAYMENT_LINK_CREATED, link, companyName);
  }
}

export class PaymentLinkCancelledEvent extends PaymentLinkStaffAct {
  constructor(link: PaymentLink, companyName: string) {
    super(PAYMENT_LINK_CANCELLED, link, companyName);
  }
}

export const PAYMENT_LINK_CAP_SET =
  "accounting_settings.payment_link_cap_set" satisfies JournalFactType;

/** Le nom du réglage, seul libellé qu'une ligne unique puisse porter. */
const CAP_LABEL = "Plafond des liens de paiement";

/**
 * Le comptable a posé — ou retiré — le plafond d'un lien libre. Un réglage qui
 * borne de l'argent se trace : « qui a relevé le plafond » est la première
 * question le jour où un lien trop gros est parti.
 */
export class PaymentLinkCapSetEvent implements JournaledEvent {
  constructor(
    readonly from: number | null,
    readonly to: number | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_LINK_CAP_SET,
      subjectType: "accounting_settings",
      subjectId: "default",
      payload: { subjectLabel: CAP_LABEL, from: this.from, to: this.to },
    };
  }
}
