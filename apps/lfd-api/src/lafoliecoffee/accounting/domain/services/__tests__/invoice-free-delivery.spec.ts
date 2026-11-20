import { issueInput } from "../../entities/__tests__/invoice-fixtures.js";
import { Invoice } from "../../entities/invoice.js";
import type { InvoiceOrderReference } from "../../entities/invoice.types.js";
import { InvalidInvoiceError } from "../../errors/invoice-errors.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { freeDeliveryTexts } from "../facturx-mentions.js";
import { renderFacturXml } from "../facturx-xml.js";
import { renderInvoicePdf } from "../invoice-pdf.js";
import { TEST_FONTS } from "./invoice-fonts-fixture.js";
import { drawnUnicodeText } from "./pdf-objects.js";

/**
 * La livraison offerte sur la facture (doc `frais-et-livraison-offerte.md`,
 * § 2.9) : figée sur le bon, dite sous la ligne de référence et en note BG-1
 * `AAI`, jamais reprise par un avoir — sans qu'aucun montant ne bouge. Les jours ne
 * sont comparés à aucune horloge.
 */

const LABEL = { fr: "Livraison offerte — client fidèle", en: "Free delivery", it: "Consegna" };

const ORDERS: readonly InvoiceOrderReference[] = [
  {
    orderId: "o_1",
    reference: "ORD-001",
    receivedOn: "2026-09-12",
    freeDelivery: { waivedCents: 2_400, waivedTtcCents: null },
  },
  {
    orderId: "o_2",
    reference: "ORD-002",
    receivedOn: "2026-09-13",
    freeDelivery: { waivedCents: 1_500, waivedTtcCents: 1_800, label: LABEL },
  },
];

const ROUTE_TEXT = "Livraison offerte — 24,00 € HT (ORD-001).";
const PROMOTION_TEXT = "Livraison offerte — client fidèle — 15,00 € HT (ORD-002).";

function offered(): Invoice {
  return Invoice.issue(issueInput({ orders: ORDERS }));
}

describe("freeDeliveryTexts", () => {
  it("une phrase par bon concerné : le franco, puis le libellé de la promotion", () => {
    expect(freeDeliveryTexts(ORDERS)).toEqual([ROUTE_TEXT, PROMOTION_TEXT]);
  });

  it("un bon sans livraison offerte, ou à barème nul, n'en dit rien", () => {
    expect(
      freeDeliveryTexts([
        { orderId: "o_1", reference: "ORD-001", receivedOn: null },
        {
          orderId: "o_2",
          reference: "ORD-002",
          receivedOn: null,
          freeDelivery: { waivedCents: 0, waivedTtcCents: null },
        },
      ]),
    ).toEqual([]);
  });
});

describe("Invoice — la livraison offerte d'un bon", () => {
  it("ne touche aucun montant : mêmes totaux qu'une pièce sans elle", () => {
    expect(offered().toState().vat).toEqual(Invoice.issue(issueInput()).toState().vat);
  });

  it("refuse un barème offert qui n'est pas un entier de centimes positif", () => {
    const broken = [
      {
        orderId: "o_1",
        reference: "ORD-001",
        receivedOn: "2026-09-12",
        freeDelivery: { waivedCents: -1, waivedTtcCents: null },
      },
    ];

    expect(() => Invoice.issue(issueInput({ orders: broken }))).toThrow(InvalidInvoiceError);
  });

  /**
   * Régression : l'avoir recopiait la mention de la facture corrigée, et un
   * avoir partiel semblait annuler la livraison offerte.
   */
  it("l'avoir ne reprend jamais la mention, même si l'appelant la cite", () => {
    const corrected = offered();
    const note = Invoice.creditNote({
      id: "cn_1",
      number: InvoiceNumber.compose("LFD", 2026, 2),
      issuedOn: "2026-10-03",
      corrected,
      priorCreditNotes: [],
      orders: [ORDERS[1]!],
      lines: corrected.toState().lines,
      vat: corrected.toState().vat,
    });

    expect(note.toState().orders).toEqual([
      { orderId: "o_2", reference: "ORD-002", receivedOn: "2026-09-13" },
    ]);
    expect(freeDeliveryTexts(note.toState().orders)).toEqual([]);
  });
});

describe("La facture rendue — la livraison offerte", () => {
  it("le XML la dit en note BG-1 AAI, une par bon, sans montant neuf", () => {
    const xml = renderFacturXml(offered());
    const plain = renderFacturXml(Invoice.issue(issueInput()));

    for (const text of [ROUTE_TEXT, PROMOTION_TEXT]) {
      expect(xml).toContain(
        `<ram:IncludedNote><ram:Content>${text}</ram:Content><ram:SubjectCode>AAI</ram:SubjectCode></ram:IncludedNote>`,
      );
    }
    const amounts = (doc: string): readonly string[] => doc.match(/Amount[^>]*>[^<]*</g) ?? [];
    expect(amounts(xml)).toEqual(amounts(plain));
  });

  it("le PDF l'imprime sous la ligne de référence, la même phrase que le XML", async () => {
    const invoice = offered();
    const pdf = await renderInvoicePdf({
      invoice,
      xml: renderFacturXml(invoice),
      fonts: TEST_FONTS,
      logo: null,
    });
    // Le paragraphe se coupe en lignes : on relit le texte d'un seul tenant.
    const printed = drawnUnicodeText(pdf).replace(/\s+/g, " ");

    expect(printed).toContain("Commandes facturées");
    expect(printed).toContain(ROUTE_TEXT);
    expect(printed).toContain(PROMOTION_TEXT);
    expect(printed.indexOf("ORD-002 (reçue le 13/09/2026)")).toBeLessThan(
      printed.indexOf(ROUTE_TEXT),
    );
  });
});
