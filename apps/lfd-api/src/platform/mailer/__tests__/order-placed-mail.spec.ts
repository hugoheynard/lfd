import type { ClientSheet } from "@lfd/contracts";

import { MAIL_LOGO_ATTACHMENT } from "../mail-logo.js";
import { b2bMailTemplates } from "../mail-templates.js";

/**
 * Ce que ces cas éprouvent, c'est ce qu'un e-mail **ne peut pas dire de lui-même**
 * une fois parti : qu'il a bien joint son QR, qu'il reste lisible quand un client
 * bloque les images, et qu'il ne transporte rien que la feuille ne portait.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

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

const HANDOVER_URL = "https://admin.lfc.test/retrait/tok_abc";

function render(overrides: Partial<Parameters<typeof mail>[0]> = {}): ReturnType<typeof mail> {
  return mail({
    sheet: sheet(),
    handoverToken: "tok_abc",
    orderUrl: "https://app.lfc.test/mes-commandes/order_1",
    handoverUrl: HANDOVER_URL,
    document: null,
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

    expect(rendered.attachments).toHaveLength(2); // + le logo, en dernier
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

    expect(rendered.attachments).toEqual([MAIL_LOGO_ATTACHMENT]); // le logo d'en-tête, et rien d'autre
    expect(rendered.html).not.toContain("cid:qr-retrait");
  });

  it("joint la CONFIRMATION DE COMMANDE en PDF, à part du QR en ligne", () => {
    const rendered = render({
      document: { fileName: "confirmation-de-commande-ORD-4812.pdf", pdfBase64: "JVBERi0=" },
    });

    expect(rendered.attachments).toHaveLength(3); // + le logo, en dernier
    const pdf = rendered.attachments?.[1];
    expect(pdf?.filename).toBe("confirmation-de-commande-ORD-4812.pdf");
    expect(pdf?.contentType).toBe("application/pdf");
    // Pièce jointe ordinaire : sans `contentId`, le client la liste à ouvrir.
    expect(pdf?.contentId).toBeUndefined();
  });

  it("joint le bon même sur une livraison, où il n'y a pas de QR", () => {
    const rendered = render({
      handoverToken: null,
      handoverUrl: "",
      document: { fileName: "confirmation-de-commande-ORD-4812.pdf", pdfBase64: "JVBERi0=" },
    });

    expect(rendered.attachments).toHaveLength(2); // + le logo, en dernier
    expect(rendered.attachments?.[0]?.contentType).toBe("application/pdf");
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

  it("une commande de particulier en TTC écrit sa remise et son bon TTC, pas leur HT", () => {
    const base = sheet();
    const html = render({
      sheet: {
        ...base,
        money: {
          ...base.money,
          voucherDiscountCents: 190,
          ttcTerms: { discountCents: 152, voucherCents: 200, deliveryFeeCents: 0 },
        },
      },
    }).html;

    expect(html).toContain("−1,52");
    expect(html).toContain("−2,00");
    expect(html).not.toContain("−1,44");
    expect(html).not.toContain("−1,90");
  });

  it("une commande de particulier en TTC dit son total, puis « dont TVA » par taux, lus sur sa part figée", () => {
    const base = sheet();
    const html = render({
      sheet: {
        ...base,
        variant: "public",
        money: {
          ...base.money,
          vatCents: 999,
          totalCents: 1_853,
          ttcTerms: { discountCents: 0, voucherCents: 0, deliveryFeeCents: 0 },
          ttcByRate: [
            { rate: 5.5, htCents: 1_327, vatCents: 73, ttcCents: 1_400 },
            { rate: 20, htCents: 377, vatCents: 76, ttcCents: 453 },
          ],
        },
      },
    }).html;
    const order = ["Réglé en ligne", "dont TVA 5,5 %", "dont TVA 20 %"];
    const positions = order.map((label) => html.indexOf(label));

    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("18,53");
    expect(html).toContain("0,73");
    expect(html).toContain("0,76");
    // Les parts sont lues, jamais reconstituées : la TVA totale de la feuille n'y paraît pas.
    expect(html).not.toContain("9,99");
  });

  it("une commande pro (line_ht) garde son pied : « dont TVA » total, puis le total", () => {
    const html = render().html;

    expect(html).toContain("dont TVA");
    expect(html).not.toContain("dont TVA 5,5 %");
    expect(html.indexOf("dont TVA")).toBeLessThan(html.indexOf("Réglé en ligne"));
    expect(html).toContain("0,71");
  });

  it("change de langue sans changer de structure", () => {
    const it = render({ locale: "it" });

    expect(it.subject).toContain("Il suo ordine");
    expect(it.attachments).toHaveLength(2); // + le logo
  });

  it("ne transporte AUCUN nom d'étage ni SKU — la feuille n'en portait pas", () => {
    const html = render().html;

    expect(html).not.toContain("mercuriale");
    expect(html).not.toContain("PAIN-TRAD");
  });
});

describe("le régime de règlement du courriel de confirmation", () => {
  function withSettlement(settlement: ClientSheet["money"]["settlement"]): ClientSheet {
    const base = sheet();
    return { ...base, money: { ...base.money, settlement } };
  }

  /**
   * Régression : le régime était DEVINÉ du seul total (`settlementOf`), et toute
   * commande non nulle se lisait « réglée » — un pro au compte recevait « C'est
   * réglé. » et « Réglé en ligne » pour une commande prélevée en fin de mois
   * (corrigé le 2026-10-08, lot F5-0).
   */
  it("une commande au compte ne part pas avec le libellé payé", () => {
    const html = render({ sheet: withSettlement("account") }).html;

    expect(html).not.toContain("Réglé en ligne");
    expect(html).not.toContain("C&#39;est réglé.");
    expect(html).not.toContain("C'est réglé.");
    expect(html).toContain("Porté à votre compte");
  });

  // Hugo, 2026-10-28 : un seul titre, quel que soit le règlement.
  it.each(["paid", "due", "account"] as const)(
    "titre « Commande confirmée » — %s",
    (settlement) => {
      expect(render({ sheet: withSettlement(settlement) }).html).toContain("Commande confirmée");
    },
  );

  it("ne dit ni le Labo, ni « Un changement ? », ni le recours de l'administrateur", () => {
    const { html } = render({ sheet: withSettlement("paid") });

    expect(html).not.toContain("Le Labo · route de la Balme");
    expect(html).not.toContain("Un changement ?");
    expect(html).not.toContain("Contactez votre administrateur");
  });

  it("une commande payée par carte se dit réglée", () => {
    expect(render({ sheet: withSettlement("paid") }).html).toContain("Réglé en ligne");
  });

  it("un règlement attendu se dit à régler", () => {
    expect(render({ sheet: withSettlement("due") }).html).toContain("Reste à régler");
  });

  it("un total nul garde le libellé du compte", () => {
    const html = render({ sheet: withSettlement("free") }).html;

    expect(html).toContain("Porté à votre compte");
    expect(html).not.toContain("Réglé en ligne");
  });
});

/**
 * F5 (plan `bons-et-facture-concordants`) : la TVA d'un pro au compte se
 * calcule une fois sur la facture du mois. Le courriel ne chiffre que le HT.
 */
describe("le courriel d'un pro au compte (F5)", () => {
  function withSettlement(settlement: ClientSheet["money"]["settlement"]): ClientSheet {
    const base = sheet();
    return { ...base, money: { ...base.money, settlement } };
  }

  it("au compte : le total HT et où trouver le reste, AUCUN chiffre de TVA ni de TTC", () => {
    const html = render({ sheet: withSettlement("account") }).html;

    // 13,67 € TTC − 0,71 € de TVA = 12,96 € HT.
    expect(html).toContain("Porté à votre compte, HT");
    expect(html).toContain("12,96");
    expect(html).toContain("TVA et TTC");
    expect(html).toContain("sur la facture du mois");
    expect(html).not.toContain("13,67");
    expect(html).not.toContain("0,71");
    expect(html).not.toContain("dont TVA");
  });

  it.each([
    ["en", "on the monthly invoice"],
    ["it", "sulla fattura del mese"],
  ] as const)("dit la même chose en %s", (locale, words) => {
    const html = render({ sheet: withSettlement("account"), locale }).html;

    expect(html).toContain(words);
    expect(html).not.toContain(locale === "en" ? "13.67" : "13,67");
  });

  it.each(["paid", "due", "free"] as const)(
    "%s : le total TTC et la TVA restent, sans la mention",
    (settlement) => {
      const html = render({ sheet: withSettlement(settlement) }).html;

      expect(html).toContain("dont TVA");
      expect(html).toContain("13,67");
      expect(html).not.toContain("facture du mois");
    },
  );
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

  // Plan E7 reliquat, choix 17 : le reste prêt n'annonce pas la commande entière.
  it("le reste prêt dit « le reste de votre commande » et compte SES pièces", () => {
    const rendered = renderReady({ remainder: { pieces: 3 } });

    expect(rendered.subject).toContain("Le reste de votre commande");
    expect(rendered.html).toContain("Le reste de votre commande vous attend au comptoir");
    expect(rendered.html).toContain("3 pièces");
    expect(rendered.html).not.toContain("Votre commande vous attend au comptoir");
  });

  it("REPORTE le QR — c'est maintenant qu'on s'en sert", () => {
    // Il était dans la confirmation, et personne ne remonte un fil de courriels
    // le téléphone à la main devant un comptoir.
    const rendered = renderReady();

    expect(rendered.attachments).toHaveLength(2); // + le logo, en dernier
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
    expect(rendered.attachments).toEqual([MAIL_LOGO_ATTACHMENT]); // le logo d'en-tête, et rien d'autre
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

/** Lot C6 (C6.4) : « gérer ou annuler » — présent quand l'appelant le donne, absent sinon. */
describe("customer.order-placed — le lien de gestion (lot C6)", () => {
  it("pose le lien sous le bouton principal", () => {
    const html = render({ manageUrl: "https://app.lfc.test/annuler#order_1.sig" }).html;
    expect(html).toContain("Gérer ou annuler ma commande");
    expect(html).toContain("https://app.lfc.test/annuler#order_1.sig");
  });

  it("n'en pose aucun sans URL", () => {
    expect(render({ manageUrl: "" }).html).not.toContain("Gérer ou annuler");
    expect(render().html).not.toContain("Gérer ou annuler");
  });

  /** La vente au poids (`plan-vente-au-poids.md`, P3) : un poids n'est pas un compte de pièces. */
  it("dit une ligne au poids par son poids dans le contenu, jamais en pièces", () => {
    const base = sheet();
    const html = render({
      sheet: {
        ...base,
        lines: [
          ...base.lines,
          {
            sku: "SAU-001",
            productName: "Saumon gravlax",
            quantity: 1250,
            saleUnit: "weight",
            unitPriceMillicents: 4_000_000,
            vatRate: 5.5,
            lineTotalCents: 5_000,
            unitPriceTtcCents: null,
            lineTotalTtcCents: null,
            priceLabels: [],
          },
        ],
      },
    }).html;

    expect(html).toContain("12 pièces · Saumon gravlax, 1,25 kg");
    expect(html).not.toContain("1262 pièces");
  });
});
