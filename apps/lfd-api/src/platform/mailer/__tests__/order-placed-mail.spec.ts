import type { ClientSheet } from "@lfd/contracts";

import { b2bMailTemplates } from "../mail-templates.js";

/**
 * Ce que ces cas éprouvent, c'est ce qu'un e-mail **ne peut pas dire de lui-même**
 * une fois parti : qu'il a bien joint son QR, qu'il reste lisible quand un client
 * bloque les images, et qu'il ne transporte rien que la feuille ne portait.
 */

const REGISTRY = b2bMailTemplates({ supportEmail: "admin@lfc.test" });

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
    lines: [
      {
        productName: "Tradition",
        quantity: 12,
        unitPriceMillicents: 120_000,
        vatRate: 0.055,
        lineTotalCents: 1_440,
        priceLabels: [],
      },
    ],
    money: {
      subtotalCents: 1_440,
      discountCents: 144,
      discountAdjustment: null,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      vatCents: 71,
      totalCents: 1_367,
      currency: "EUR",
    },
    ...overrides,
  };
}

const HANDOVER_URL = "https://admin.lfc.test/retrait/tok_abc";

function render(overrides: Partial<Parameters<typeof mail>[0]> = {}): ReturnType<typeof mail> {
  return mail({
    sheet: sheet(),
    handoverToken: "tok_abc",
    orderUrl: "https://app.lfc.test/mes-commandes/order_1",
    handoverUrl: HANDOVER_URL,
    locale: "fr",
    ...overrides,
  });
}

const mail = REGISTRY["customer.order-placed"];

describe("le courriel de confirmation", () => {
  it("joint le QR EN LIGNE, et le corps le référence par son `cid:`", () => {
    // Ni `data:` URI — Gmail les supprime — ni URL distante, dont le proxy de
    // Google verrait passer le jeton.
    const rendered = render();

    expect(rendered.attachments).toHaveLength(1);
    expect(rendered.attachments?.[0]?.contentId).toBe("qr-retrait");
    expect(rendered.attachments?.[0]?.contentType).toBe("image/png");
    expect(rendered.html).toContain('src="cid:qr-retrait"');
  });

  it("joint un PNG réel, pas une chaîne vide", () => {
    const base64 = render().attachments?.[0]?.contentBase64 ?? "";
    const bytes = Buffer.from(base64, "base64");

    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("reste utilisable quand le client BLOQUE les images", () => {
    // Le repli n'est pas une politesse : sans lui, un client qui bloque les
    // images reçoit un carré vide et n'a plus rien à présenter au comptoir.
    const html = render().html;

    expect(html).toContain('alt="Votre code de retrait — ORD-4812"');
    // Le numéro en clair sous l'image : de quoi retrouver la commande à la main.
    expect(html).toMatch(/ORD-4812/u);
  });

  it("ne joint RIEN sur une livraison — il n'y a pas de comptoir", () => {
    const rendered = render({ handoverToken: null, handoverUrl: "" });

    expect(rendered.attachments).toBeUndefined();
    expect(rendered.html).not.toContain("cid:");
  });

  it("porte le récapitulatif, dans l'ordre de l'écran", () => {
    const html = render().html;
    const order = ["Retrait", "Contenu", "Remise", "dont TVA", "Réglé en ligne"];
    const positions = order.map((label) => html.indexOf(label));

    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("écrit les montants dans la langue du destinataire", () => {
    // « 13,67 € » et « €13.67 » ne s'écrivent pas pareil, et un e-mail italien
    // aux séparateurs français a l'air mal traduit — donc suspect.
    expect(render({ locale: "fr" }).html).toContain("13,67");
    expect(render({ locale: "en" }).html).toContain("13.67");
  });

  it("porte le numéro de commande dans son OBJET", () => {
    expect(render().subject).toContain("ORD-4812");
  });

  it("change de langue sans changer de structure", () => {
    const it = render({ locale: "it" });

    expect(it.subject).toContain("Il suo ordine");
    expect(it.attachments).toHaveLength(1);
  });

  it("ne transporte AUCUN nom d'étage ni SKU — la feuille n'en portait pas", () => {
    const html = render().html;

    expect(html).not.toContain("mercuriale");
    expect(html).not.toContain("PAIN-TRAD");
  });
});

describe("le courriel « votre commande est prête »", () => {
  const ready = REGISTRY["customer.order-ready"];

  function renderReady(overrides: Partial<Parameters<typeof ready>[0]> = {}) {
    return ready({
      sheet: sheet(),
      handoverToken: "tok_abc",
      orderUrl: "https://app.lfc.test/mes-commandes",
      handoverUrl: HANDOVER_URL,
      locale: "fr",
      ...overrides,
    });
  }

  it("dit ce qu'il y a à FAIRE, pas ce qui a été payé", () => {
    // Le décompte était le travail de la confirmation. Le répéter ferait relire
    // des montants à quelqu'un qui met son manteau.
    const html = renderReady().html;

    expect(html).toContain("Votre commande vous attend au comptoir");
    expect(html).not.toContain("Sous-total");
    expect(html).not.toContain("Total TTC");
  });

  it("REPORTE le QR — c'est maintenant qu'on s'en sert", () => {
    // Il était dans la confirmation, et personne ne remonte un fil de courriels
    // le téléphone à la main devant un comptoir.
    const rendered = renderReady();

    expect(rendered.attachments).toHaveLength(1);
    expect(rendered.html).toContain('src="cid:qr-retrait"');
  });

  it("parle autrement d'une LIVRAISON, et n'y met pas de code", () => {
    const rendered = renderReady({
      sheet: sheet({
        fulfillment: { ...sheet().fulfillment, method: "delivery", pickupLabel: null },
      }),
      handoverToken: null,
      handoverUrl: "",
    });

    expect(rendered.html).toContain("Votre commande part vers vous");
    expect(rendered.attachments).toBeUndefined();
  });

  it("porte le numéro dans son objet, dans les trois langues", () => {
    expect(renderReady({ locale: "fr" }).subject).toBe("Votre commande ORD-4812 est prête");
    expect(renderReady({ locale: "en" }).subject).toBe("Your order ORD-4812 is ready");
    expect(renderReady({ locale: "it" }).subject).toBe("Il suo ordine ORD-4812 è pronto");
  });

  it("nomme le POINT de retrait quand il en porte un", () => {
    // « Le Labo » se dit au téléphone ; « Val d'Isère » ne suffit pas à savoir
    // où pousser une porte.
    expect(renderReady().html).toContain("Le Labo");
  });
});
