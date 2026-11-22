import {
  PaymentLinkNatureCorruptError,
  UnknownFreeChargeNatureError,
  PaymentLinkChannelCorruptError,
  PaymentLinkNotOpenError,
} from "../../errors/payment-link-errors.js";
import { PaymentLinkTerms } from "../../value-objects/payment-link-terms.js";
import { PaymentLink } from "../payment-link.js";

/** Des instants comparés entre eux seulement — jamais à l'horloge. */
const CREATED = new Date("2026-01-10T09:00:00.000Z");
const LATER = new Date("2026-01-10T10:00:00.000Z");
const LATEST = new Date("2026-01-10T11:00:00.000Z");

/** Une demande de paiement libre neuve : canal `door`. */
function doorLink(): PaymentLink {
  return PaymentLink.create({
    id: "pl_1",
    companyId: "co_1",
    terms: PaymentLinkTerms.create(12_000, "Régularisation août", null),
    nature: "regularization",
    createdAt: CREATED,
    createdByStaffId: "staff_1",
  });
}

/** Un lien d'avant la porte, relu de sa ligne : canal `checkout`. */
function openLink(): PaymentLink {
  return PaymentLink.reconstitute({
    ...doorLink().toPersistence(),
    stripeSessionId: "cs_test_1",
    url: "https://checkout.stripe.test/cs_test_1",
  });
}

describe("PaymentLink — le cycle d'un lien libre", () => {
  it("naît ouvert, sans paiement ni annulation", () => {
    const snapshot = openLink().toPersistence();
    expect(snapshot).toMatchObject({
      status: "open",
      amountCents: 12_000,
      stripeSessionId: "cs_test_1",
      paidAt: null,
      cancelledAt: null,
      cancelledByStaffId: null,
    });
  });

  it("passe à payé, et un webhook rejoué ne bouge plus rien", () => {
    const link = openLink();
    expect(link.markPaid(LATER)).toBe("settled");
    expect(link.markPaid(LATEST)).toBe("already_paid");
    expect(link.toPersistence()).toMatchObject({ status: "paid", paidAt: LATER });
  });

  it("🔴 payé après annulation : passe QUAND MÊME à payé, et le signale", () => {
    const link = openLink();
    link.cancel(LATER, "staff_2");
    expect(link.markPaid(LATEST)).toBe("settled_after_cancel");
    // L'annulation reste datée et signée : c'est ce qui permet de dire les deux.
    expect(link.toPersistence()).toMatchObject({
      status: "paid",
      paidAt: LATEST,
      cancelledAt: LATER,
      cancelledByStaffId: "staff_2",
    });
  });

  it("s'annule depuis ouvert, et refuse une seconde annulation", () => {
    const link = openLink();
    link.cancel(LATER, "staff_2");
    expect(link.status).toBe("cancelled");
    expect(() => link.cancel(LATEST, "staff_2")).toThrow(PaymentLinkNotOpenError);
  });

  it("refuse d'annuler un lien payé, en disant qu'il l'est", () => {
    const link = openLink();
    link.markPaid(LATER);
    expect(() => link.cancel(LATEST, "staff_2")).toThrow(/déjà payé/u);
  });

  it("expire depuis ouvert seulement", () => {
    const link = openLink();
    expect(link.expire()).toBe(true);
    expect(link.expire()).toBe(false);
    expect(link.status).toBe("expired");
  });

  it("n'expire pas un lien annulé : c'est nous qui avons fermé la session", () => {
    const link = openLink();
    link.cancel(LATER, "staff_2");
    expect(link.expire()).toBe(false);
    expect(link.status).toBe("cancelled");
  });

  it("se relit tel qu'il a été rangé", () => {
    const link = openLink();
    link.markPaid(LATER);
    const again = PaymentLink.reconstitute(link.toPersistence());
    expect(again.toPersistence()).toEqual(link.toPersistence());
  });
});

describe("PaymentLink — le canal, fermé", () => {
  it("une demande de paiement libre neuve naît en canal door, sans session ni URL", () => {
    const link = doorLink();
    expect(link.channel).toEqual({ kind: "door" });
    expect(link.checkoutSession).toBeNull();
    expect(link.toPersistence()).toMatchObject({ stripeSessionId: null, url: null });
  });

  it("un ancien lien se relit en canal checkout, avec sa session", () => {
    expect(openLink().checkoutSession).toEqual({
      sessionId: "cs_test_1",
      url: "https://checkout.stripe.test/cs_test_1",
    });
  });

  it("🔴 un lien door n'expire pas : il n'a pas de session à laisser mourir", () => {
    const link = doorLink();
    expect(link.expire()).toBe(false);
    expect(link.status).toBe("open");
  });

  it("un lien door se paie, s'annule, et se paie après annulation comme un ancien", () => {
    const link = doorLink();
    link.cancel(LATER, "staff_2");
    expect(link.isCancelled).toBe(true);
    expect(link.markPaid(LATEST)).toBe("settled_after_cancel");
    expect(link.isCancelled).toBe(false);
  });

  it("refuse une ligne qui porte une session sans URL", () => {
    expect(() =>
      PaymentLink.reconstitute({ ...doorLink().toPersistence(), stripeSessionId: "cs_x" }),
    ).toThrow(PaymentLinkChannelCorruptError);
  });

  it("un lien door se relit tel qu'il a été rangé", () => {
    const link = doorLink();
    const again = PaymentLink.reconstitute(link.toPersistence());
    expect(again.channel).toEqual({ kind: "door" });
  });
});

describe("PaymentLink — la nature", () => {
  it("naît avec la nature choisie, et la range", () => {
    expect(doorLink().nature).toBe("regularization");
    expect(doorLink().toPersistence().nature).toBe("regularization");
  });

  it("refuse à la création une clé hors registre", () => {
    expect(() =>
      PaymentLink.create({
        id: "pl_2",
        companyId: "co_1",
        terms: PaymentLinkTerms.create(100, "Divers", null),
        nature: "bribe",
        createdAt: CREATED,
        createdByStaffId: "staff_1",
      }),
    ).toThrow(UnknownFreeChargeNatureError);
  });

  it("une demande d'avant le registre se relit sans nature, jamais une nature inventée", () => {
    const link = PaymentLink.reconstitute({ ...doorLink().toPersistence(), nature: null });
    expect(link.nature).toBeNull();
    expect(link.toPersistence().nature).toBeNull();
  });

  it("refuse une ligne qui porte une nature absente du registre", () => {
    expect(() =>
      PaymentLink.reconstitute({ ...doorLink().toPersistence(), nature: "bribe" }),
    ).toThrow(PaymentLinkNatureCorruptError);
  });
});
