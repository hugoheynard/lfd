import type { ClientSheet } from "@lfd/contracts";

import { b2bMailTemplates } from "../mail-templates.js";

/**
 * « Votre commande a été annulée par notre équipe » (plan
 * `order/plan-annulation-de-commande.md`, C3.5) : le jour, ce qu'il advient de
 * l'argent, le bon rendu — et ni QR ni motif.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const mail = REGISTRY["customer.order-cancelled"];

function sheet(overrides: Partial<ClientSheet> = {}): ClientSheet {
  return {
    orderId: "order_1",
    reference: "ORD-4812",
    audience: "client",
    placedAt: "2026-09-07T06:00:00.000Z",
    requestedFor: "2026-09-08",
    fulfillment: {
      method: "pickup",
      address: {
        label: "Le Labo",
        pays: "France",
        ligne1: "route de la Balme",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
      },
      pickupLabel: "Le Labo",
      window: null,
      contact: null,
      signatureRequired: false,
    },
    note: "",
    origin: "self_service",
    issuedAt: "2026-09-07T06:00:00.000Z",
    revision: 0,
    customer: { tradeName: "Hôtel des Trois Ponts", legalName: "SAS des Trois Ponts" },
    variant: "pro",
    customerPhone: null,
    lines: [
      {
        sku: "PAI-001",
        productName: "Tradition",
        quantity: 12,
        unitPriceMillicents: 120_000,
        vatRate: 0.055,
        lineTotalCents: 1_440,
        unitPriceTtcCents: null,
        lineTotalTtcCents: null,
        priceLabels: [],
      },
    ],
    money: {
      subtotalCents: 1_440,
      discountCents: 144,
      discountAdjustment: null,
      voucherDiscountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      vatCents: 71,
      vatShares: [{ rate: 5.5, amountCents: 71 }],
      totalCents: 1_367,
      currency: "EUR",
      settlement: "paid",
    },
    ...overrides,
  };
}

describe("le courriel « commande annulée par l'équipe »", () => {
  it("nomme la commande et son jour, et dit que rien ne sera facturé (total nul)", () => {
    const rendered = mail({ sheet: sheet(), regime: "free", voucherReturned: false, locale: "fr" });

    expect(rendered.subject).toBe("Commande ORD-4812 annulée");
    expect(rendered.html).toContain("Votre commande ORD-4812 pour le mardi 8 septembre");
    expect(rendered.html).toContain("Rien ne vous sera facturé pour cette commande.");
    expect(rendered.html).not.toContain("bon de fidélité");
  });

  it("une carte non payée : aucun paiement prélevé ; le bon rendu est annoncé", () => {
    const rendered = mail({ sheet: sheet(), regime: "due", voucherReturned: true, locale: "fr" });

    expect(rendered.html).toContain("Aucun paiement n&#39;a été prélevé.");
    expect(rendered.html).toContain("Votre bon de fidélité vous est rendu");
  });

  it("sans jour de service, la phrase se passe du jour", () => {
    const rendered = mail({
      sheet: sheet({ requestedFor: null }),
      regime: "free",
      voucherReturned: false,
      locale: "fr",
    });

    expect(rendered.html).toContain("Votre commande ORD-4812 a été annulée par notre équipe.");
  });

  it("ne porte ni QR ni lien de retrait", () => {
    const rendered = mail({ sheet: sheet(), regime: "due", voucherReturned: false, locale: "fr" });

    expect(rendered.attachments).toBeUndefined();
    expect(rendered.html).not.toContain("/retrait/");
  });

  it("parle italien quand on le lui demande", () => {
    const rendered = mail({ sheet: sheet(), regime: "free", voucherReturned: false, locale: "it" });

    expect(rendered.subject).toBe("Ordine ORD-4812 annullato");
  });
});
