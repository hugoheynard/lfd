import { Buffer } from "node:buffer";
import { crc32, deflateSync } from "node:zlib";

import {
  breakdownOf,
  issueInput,
  issuedInvoice,
  line,
} from "../../entities/__tests__/invoice-fixtures.js";
import { Invoice } from "../../entities/invoice.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { facturXArithmeticViolations } from "../facturx-arithmetic.js";
import { renderFacturXml } from "../facturx-xml.js";
import { renderInvoicePdf } from "../invoice-pdf.js";
import { invoiceDocumentKey } from "../invoice-pdf-wording.js";
import { TEST_FONTS } from "./invoice-fonts-fixture.js";
import { drawnUnicodeText, pdfObjects, streamsWith } from "./pdf-objects.js";

/**
 * Le PDF/A-3b Factur-X d'une pièce (plan `plan-emission-de-la-facture.md`,
 * E3b). Sans veraPDF ni Schematron (hors lot) : on vérifie ce qu'un lecteur
 * Factur-X cherche d'abord — l'en-tête, le niveau PDF/A déclaré, le XML joint
 * au bit près et sa relation, les polices embarquées — puis le texte imprimé.
 * Les dates ne sont comparées qu'entre elles, jamais à l'horloge.
 */

const FONTS = TEST_FONTS;

/** Un PNG gris réel de 8 × 8 : signature, IHDR, IDAT, IEND. */
function tinyPng(): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(9 * 8))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function render(invoice: Invoice, logo: Buffer | null = null): Promise<Buffer> {
  return renderInvoicePdf({ invoice, xml: renderFacturXml(invoice), fonts: FONTS, logo });
}

describe("renderInvoicePdf — le contenant PDF/A-3b", () => {
  const invoice = issuedInvoice();
  let pdf: Buffer;
  let text: string;
  beforeAll(async () => {
    pdf = await render(invoice);
    text = pdf.toString("latin1");
  });

  it("est un PDF 1.7 qui se déclare PDF/A-3, niveau B, dans son XMP", () => {
    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.7");
    expect(text).toContain("<pdfaid:part>3</pdfaid:part>");
    expect(text).toContain("<pdfaid:conformance>B</pdfaid:conformance>");
    expect(text).toContain("/OutputIntents");
    expect(text).toContain("/S /GTS_PDFA1");
  });

  it("porte l'extension XMP Factur-X EN 16931 et son schéma déclaré", () => {
    expect(text).toContain("<fx:DocumentType>INVOICE</fx:DocumentType>");
    expect(text).toContain("<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>");
    expect(text).toContain("<fx:Version>1.0</fx:Version>");
    expect(text).toContain("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>");
    expect(text).toContain(
      "<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>",
    );
  });

  it("joint factur-x.xml, octet pour octet le XML de la pièce, en relation Alternative", () => {
    const [attached] = streamsWith(pdf, "/Type /EmbeddedFile");
    const xml = renderFacturXml(invoice);

    expect(attached?.equals(Buffer.from(xml, "utf8"))).toBe(true);
    expect(facturXArithmeticViolations(attached?.toString("utf8") ?? "")).toEqual([]);
    expect(text).toContain("/AFRelationship /Alternative");
    expect(text).toContain("/F (factur-x.xml)");
    expect(text).toContain("/Subtype /text#2Fxml");
    expect(text).toMatch(/\/AF \[\d+ 0 R\]/u);
  });

  it("embarque ses deux polices, et aucune police standard", () => {
    const fonts = [...pdfObjects(pdf).values()].filter((object) =>
      object.dictionary.includes("/Type /Font"),
    );

    expect(fonts.filter((font) => font.dictionary.includes("/Subtype /Type0"))).toHaveLength(2);
    expect(text.match(/\/FontFile2 \d+ 0 R/gu)).toHaveLength(2);
    expect(text).not.toMatch(/\/BaseFont \/(Helvetica|Times|Courier|Symbol|ZapfDingbats)/u);
  });

  it("est déterministe : deux rendus de la même pièce sont les mêmes octets", async () => {
    expect((await render(invoice)).equals(pdf)).toBe(true);
  });
});

describe("renderInvoicePdf — ce que la facture imprime", () => {
  it("le vendeur, l'acheteur, le numéro, les dates, les lignes, la TVA, les totaux, les mentions", async () => {
    const invoice = issuedInvoice();
    const state = invoice.toState();
    // La police dessine l'insécable avec le glyphe de l'espace : son
    // `ToUnicode` le relit en espace simple.
    const printed = drawnUnicodeText(await render(invoice));

    for (const expected of [
      "FACTURE",
      `N° ${state.number}`,
      "Date d'émission : 30/09/2026",
      "Date d'échéance : 14/10/2026",
      state.seller.name,
      `SIREN ${state.seller.siren}`,
      "Boulangerie du Port",
      "SIREN 552100554",
      "TVA intracommunautaire FR89552100554",
      "Produit PAIN",
      "Réf. PAIN",
      "2 pièce(s)",
      `5,00 €`,
      `5,50 %`,
      `20,00 %`,
      `10,00 €`,
      `Total TTC`,
      `${String(state.vat.totalCents / 100).replace(".", ",")} €`,
      "Pénalités de retard : 14,15 % l'an.",
      "Indemnité forfaitaire pour frais de recouvrement : 40,00 €.",
      "Pas d'escompte pour paiement anticipé.",
      "livraison de biens",
      "CMD-001 (livré le 12/09/2026)",
      "CMD-002 (livraison non constatée)",
      `${state.number} — ${state.seller.name}`,
      "page 1 / 1",
    ]) {
      expect(printed).toContain(expected);
    }
    expect(printed).not.toContain("�");
    expect(printed).not.toContain("Règlement");
  });

  it("le prélèvement figé (BG-16) : la RUM et l'ICS du vendeur", async () => {
    const invoice = Invoice.issue(
      issueInput({ paymentMeans: { code: "59", mandateReference: "RUM-PORT-1" } }),
    );
    const printed = drawnUnicodeText(await render(invoice));

    expect(printed).toContain("mandat (RUM) RUM-PORT-1");
    expect(printed).toContain(`créancier (ICS) ${invoice.toState().seller.ics}`);
  });

  it("un avoir dit AVOIR et la facture qu'il corrige, sans échéance", async () => {
    const corrected = issuedInvoice();
    const lines = [line("PAIN", 5.5, 500)];
    const note = Invoice.creditNote({
      id: "inv_2",
      number: InvoiceNumber.compose(2026, 2),
      issuedOn: "2026-10-02",
      corrected,
      priorCreditNotes: [],
      orders: [],
      lines,
      vat: breakdownOf(lines),
    });
    const printed = drawnUnicodeText(await render(note));

    expect(printed).toContain("AVOIR");
    expect(printed).toContain("Avoir sur la facture FA-2026-000001");
    expect(printed).toContain("Total TTC de l'avoir");
    expect(printed).not.toContain("Date d'échéance");
  });

  it("une longue facture passe sur plusieurs pages, l'en-tête des colonnes rappelé", async () => {
    const many = Array.from({ length: 70 }, (_, index) => line(`SKU${String(index)}`, 5.5, 100));
    const invoice = Invoice.issue(issueInput({ lines: many, vat: breakdownOf(many) }));
    const printed = drawnUnicodeText(await render(invoice));

    expect(printed).toContain("page 2 / ");
    expect(printed).toContain("(suite)");
    expect(printed.split("Désignation").length - 1).toBeGreaterThan(1);
    expect(printed).toContain("Réf. SKU69");
  });

  it("le logo de l'entité, quand il existe, entre comme image", async () => {
    const pdf = await render(issuedInvoice(), tinyPng());

    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
  });
});

describe("invoiceDocumentKey", () => {
  it("dérive la clé de l'entité et du numéro, et de rien d'autre", () => {
    expect(invoiceDocumentKey({ legalEntityId: "le_1", number: "FA-2026-000001" })).toBe(
      "invoices/le_1/FA-2026-000001.pdf",
    );
  });
});
