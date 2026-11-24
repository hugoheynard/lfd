import { PeriodQuote, type PeriodQuoteSnapshot } from "../../entities/period-quote.js";
import type { InvoiceableOrder } from "../monthly-invoicing.js";
import {
  periodQuoteDocumentKey,
  periodQuoteFileName,
  renderPeriodQuotePdf,
  type PeriodQuoteSeller,
} from "../period-quote-pdf.js";
import { frozenOrder } from "./collection-fixtures.js";
import { TEST_FONTS } from "./invoice-fonts-fixture.js";
import { drawnUnicodeText } from "./pdf-objects.js";

/**
 * Le PDF du devis de période (QD4) : ses mentions obligatoires, ses totaux
 * tirés du calcul de la facture, et l'ABSENCE de tout ce qui ferait d'un
 * devis une Factur-X. Les dates sont des données, jamais comparées à
 * l'horloge.
 */

/** Le 1er novembre 2026 à 00h00, heure de Paris : la clôture d'octobre. */
const CLOSES_AT = new Date("2026-10-31T23:00:00.000Z");
const STARTS_AT = new Date("2026-09-30T22:00:00.000Z");
const PLACED_AT = new Date("2026-10-12T08:00:00.000Z");

const SELLER: PeriodQuoteSeller = {
  name: "La Folie Douce SAS",
  legalForm: "SAS",
  siren: "552100554",
  vatNumber: "FR89552100554",
  addressLines: ["1 route de la Balme", "73150 Val d'Isère"],
};

function order(id: string): InvoiceableOrder {
  return {
    orderId: id,
    orderNumber: `ORD-${id}`,
    companyId: "c_army",
    placedAt: PLACED_AT,
    receivedOn: "2026-10-13",
    billedCompanyId: null,
    frozen: frozenOrder(`ORD-${id}`, PLACED_AT),
    deliveryNoteNumbers: ["BL-1"],
    budgetCommitment: null,
  };
}

const ORDERS = [order("a"), order("b")];

function quote(serviceCode = "SERV-RH"): PeriodQuoteSnapshot {
  return PeriodQuote.shelve({
    id: "q_1",
    rank: 4,
    legalEntityId: "le_1",
    payerCompanyId: "c_army",
    payerName: "Caserne des Alpes",
    mandateId: null,
    serviceCode,
    periodStartsAt: STARTS_AT,
    periodClosesAt: CLOSES_AT,
    orders: ORDERS,
    createdAt: CLOSES_AT,
  }).toSnapshot();
}

async function printed(
  snapshot: PeriodQuoteSnapshot,
  mercuriale: string | null,
): Promise<{ readonly text: string; readonly raw: string }> {
  const pdf = await renderPeriodQuotePdf({
    quote: snapshot,
    orders: ORDERS,
    seller: SELLER,
    mercuriale,
    fonts: TEST_FONTS,
  });
  return { text: drawnUnicodeText(pdf), raw: pdf.toString("latin1") };
}

describe("renderPeriodQuotePdf", () => {
  it("imprime les mentions du devis : pas une facture, numéro et version, période, parties, code service, mercuriale, retour", async () => {
    const { text } = await printed(quote(), "Tarif convenu de la caserne");

    for (const expected of [
      "DEVIS",
      "Devis — ceci n'est pas une facture",
      "N° D-20261031-4",
      "Version 1",
      "Période du 01/10/2026 au 31/10/2026",
      "Vendeur",
      "La Folie Douce SAS (SAS)",
      "SIREN 552100554",
      "Payeur",
      "Caserne des Alpes",
      "Code service : SERV-RH",
      "Tarif appliqué : la mercuriale « Tarif convenu de la caserne ».",
      "À retourner avec votre numéro d'engagement",
      "ORD-a — livrée le 13/10/2026 — BL BL-1",
      "Pain",
    ]) {
      expect(text).toContain(expected);
    }
  });

  it("imprime les totaux HT, TVA et TTC de la facture qu'il annonce", async () => {
    const snapshot = quote();
    const { text } = await printed(snapshot, null);

    // Deux pains à 9,48 € HT, TVA 5,5 % calculée une fois sur l'ensemble.
    expect(text).toContain("Total HT");
    expect(text).toContain("18,96 €");
    expect(text).toContain("Total TVA");
    expect(text).toContain("1,04 €");
    expect(text).toContain("Total TTC");
    expect(text).toContain("20,00 €");
    expect(snapshot.totalTtcCents).toBe(2_000);
  });

  it("dit quand aucune mercuriale n'agit, et quand il n'y a pas de code service", async () => {
    const { text } = await printed(quote(""), null);

    expect(text).toContain("Code service : aucun");
    expect(text).toContain("aucune mercuriale n'agit chez le payeur");
  });

  it("n'est pas une Factur-X : ni XML joint, ni déclaration PDF/A, ni profil Factur-X", async () => {
    const { raw } = await printed(quote(), null);

    expect(raw).not.toContain("factur-x.xml");
    expect(raw).not.toContain("/AFRelationship");
    expect(raw).not.toContain("pdfaid:part");
    expect(raw).not.toContain("fx:ConformanceLevel");
    expect(raw).not.toContain("/EmbeddedFiles");
  });

  it("rend les mêmes octets pour le même devis", async () => {
    const snapshot = quote();
    const input = {
      quote: snapshot,
      orders: ORDERS,
      seller: SELLER,
      mercuriale: null,
      fonts: TEST_FONTS,
    };

    const [first, second] = [await renderPeriodQuotePdf(input), await renderPeriodQuotePdf(input)];

    expect(first.equals(second)).toBe(true);
  });
});

describe("le nom et la clé du document", () => {
  it("rangé sous quotes/<entité>/<numéro>-v<version>.pdf", () => {
    const snapshot = { ...quote(), version: 2 };

    expect(periodQuoteFileName(snapshot)).toBe("D-20261031-4-v2.pdf");
    expect(periodQuoteDocumentKey(snapshot)).toBe("quotes/le_1/D-20261031-4-v2.pdf");
  });
});
