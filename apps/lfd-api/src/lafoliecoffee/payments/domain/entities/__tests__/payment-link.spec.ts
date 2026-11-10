import { PaymentLinkNotOpenError } from "../../errors/payment-link-errors.js";
import { PaymentLinkTerms } from "../../value-objects/payment-link-terms.js";
import { PaymentLink } from "../payment-link.js";

/** Des instants comparés entre eux seulement — jamais à l'horloge. */
const CREATED = new Date("2026-01-10T09:00:00.000Z");
const LATER = new Date("2026-01-10T10:00:00.000Z");
const LATEST = new Date("2026-01-10T11:00:00.000Z");

function openLink(): PaymentLink {
  return PaymentLink.create({
    id: "pl_1",
    companyId: "co_1",
    terms: PaymentLinkTerms.create(12_000, "Régularisation août", null),
    checkout: { sessionId: "cs_test_1", url: "https://checkout.stripe.test/cs_test_1" },
    createdAt: CREATED,
    createdByStaffId: "staff_1",
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
