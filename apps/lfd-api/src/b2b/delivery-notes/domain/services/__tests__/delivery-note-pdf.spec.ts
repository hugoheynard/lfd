import { pdfText } from "../../../../orders/domain/services/__tests__/pdf-text.js";
import { ART } from "../../../../orders/domain/services/__tests__/client-sheet.fixture.js";
import {
  deliveryNotePdfFileName,
  renderCarrierNotePdf,
  renderClientNotePdf,
} from "../delivery-note-pdf.js";
import { carrierNoteOf, clientNoteOf } from "../delivery-note-sheet.js";
import { handedOverNote, HEAD, PRO_BILLING } from "./delivery-note-sheet.fixture.js";

const DELIVERY_ART = { logo: ART.logo };

/**
 * Le « € » tel que `pdfText` le relit : les polices standard l'encodent en
 * WinAnsi (0x80), que le décodage latin1 rend en U+0080. Chercher « € » tout
 * court ne trouverait jamais rien — et un test d'absence qui ne peut pas
 * échouer ne prouve rien. Le BL chiffré, lui, DOIT le contenir (ci-dessous).
 */
const EURO = "\u0080";

describe("le BL de transport en PDF", () => {
  it("porte le titre, le numéro du BL et le rappel de la commande", async () => {
    const text = pdfText(
      await renderCarrierNotePdf(carrierNoteOf(handedOverNote(), HEAD), DELIVERY_ART),
    );

    expect(text).toContain("BON DE LIVRAISON");
    expect(text).toContain("BL-1042-1");
    expect(text).toContain("ORD-1042");
    expect(text).toContain("Pain de campagne");
  });

  it("n'imprime aucun symbole €", async () => {
    const text = pdfText(
      await renderCarrierNotePdf(carrierNoteOf(handedOverNote(), HEAD), DELIVERY_ART),
    );

    expect(text).not.toContain(EURO);
    expect(text).not.toContain("€");
  });

  it("a la zone de réception et la mention « Ce n'est pas une facture. »", async () => {
    const text = pdfText(
      await renderCarrierNotePdf(carrierNoteOf(handedOverNote(), HEAD), DELIVERY_ART),
    );

    expect(text).toContain("Reçu par");
    expect(text).toContain("Signature");
    expect(text).toContain("Ce n'est pas une facture.");
  });

  it("rend les mêmes octets deux fois", async () => {
    const note = carrierNoteOf(handedOverNote(), HEAD);
    const first = await renderCarrierNotePdf(note, DELIVERY_ART);

    expect(first.equals(await renderCarrierNotePdf(note, DELIVERY_ART))).toBe(true);
  });
});

describe("le BL chiffré en PDF", () => {
  it("porte le numéro, les montants et la mention de non-facture", async () => {
    const note = clientNoteOf(handedOverNote(), HEAD, PRO_BILLING);
    const text = pdfText(await renderClientNotePdf(note, DELIVERY_ART));

    expect(text).toContain("BL-1042-1");
    expect(text).toContain(EURO);
    expect(text).toContain("Total HT");
    expect(text).toContain("Ce n'est pas une facture.");
    expect(text).toContain("* Non concerné par la remise retrait.");
  });

  it("propose un nom de fichier par lecteur", () => {
    expect(deliveryNotePdfFileName(clientNoteOf(handedOverNote(), HEAD, PRO_BILLING))).toBe(
      "bon-de-livraison-BL-1042-1.pdf",
    );
    expect(deliveryNotePdfFileName(carrierNoteOf(handedOverNote(), HEAD))).toBe(
      "bon-de-livraison-BL-1042-1-transport.pdf",
    );
  });
});
