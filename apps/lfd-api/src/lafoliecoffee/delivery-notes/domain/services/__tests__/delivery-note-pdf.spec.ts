import { pdfText } from "../../../../orders/domain/services/__tests__/pdf-text.js";
import { ART } from "../../../../orders/domain/services/__tests__/client-sheet.fixture.js";
import {
  deliveryNotePdfFileName,
  renderCarrierNotePdf,
  renderClientNotePdf,
} from "../delivery-note-pdf.js";
import { carrierNoteOf, clientNoteOf } from "../delivery-note-sheet.js";
import { undeliveredOf } from "../undelivered-lines.js";
import {
  BREAD,
  CROISSANT,
  handedOverNote,
  HEAD,
  PRO_BILLING,
} from "./delivery-note-sheet.fixture.js";

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

/** Le nombre d'occurrences de `needle` dans `text`. */
function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** Un départ incomplet : le croissant ne part pas, sa ligne reste à zéro (`departingSourceOf`). */
function croissantLeftBehind() {
  const note = handedOverNote();
  const lines = note.lines.map((line) =>
    line.sku === CROISSANT.sku ? { ...line, quantity: 0 } : line,
  );
  const state = { ...note, lines };
  return { state, undelivered: undeliveredOf([BREAD, CROISSANT], [state], state) };
}

describe("seulement les lignes remises (Hugo, 2026-11-03)", () => {
  it("le BL de transport tait la ligne à zéro dans le tableau et la dit sous lui", async () => {
    const { state, undelivered } = croissantLeftBehind();
    const text = pdfText(
      await renderCarrierNotePdf(carrierNoteOf(state, HEAD), DELIVERY_ART, undelivered),
    );

    expect(text).toContain("Non livré : 6 × Croissant.");
    expect(count(text, "Croissant")).toBe(1);
    expect(text).toContain("Pain de campagne");
  });

  it("le BL chiffré aussi", async () => {
    const { state, undelivered } = croissantLeftBehind();
    const text = pdfText(
      await renderClientNotePdf(clientNoteOf(state, HEAD, PRO_BILLING), DELIVERY_ART, undelivered),
    );

    expect(text).toContain("Non livré : 6 × Croissant.");
    expect(count(text, "Croissant")).toBe(1);
  });

  it("un BL sans manque n'a pas la mention", async () => {
    const state = handedOverNote();
    const undelivered = undeliveredOf([BREAD, CROISSANT], [state], state);
    const carrier = pdfText(
      await renderCarrierNotePdf(carrierNoteOf(state, HEAD), DELIVERY_ART, undelivered),
    );
    const client = pdfText(
      await renderClientNotePdf(clientNoteOf(state, HEAD, PRO_BILLING), DELIVERY_ART, undelivered),
    );

    expect(undelivered).toEqual([]);
    expect(carrier).not.toContain("Non livré");
    expect(client).not.toContain("Non livré");
  });
});

/** Un BL de vingt-deux lignes : il tient sur deux pages (treize sur la première). */
function longNote() {
  const note = handedOverNote();
  const lines = Array.from({ length: 22 }, (_, index) => ({
    ...BREAD,
    sku: `PAIN-${String(index).padStart(3, "0")}`,
    productName: `Pain n° ${String(index)}`,
  }));
  return { ...note, lines };
}

describe("le folio et l'en-tête sur chaque page (Hugo, 2026-11-03)", () => {
  it.each([
    [
      "transport",
      (state: ReturnType<typeof longNote>) =>
        renderCarrierNotePdf(carrierNoteOf(state, HEAD), DELIVERY_ART),
    ],
    [
      "chiffré",
      (state: ReturnType<typeof longNote>) =>
        renderClientNotePdf(clientNoteOf(state, HEAD, PRO_BILLING), DELIVERY_ART),
    ],
  ])(
    "le BL %s de deux pages porte « Page 1 / 2 », « Page 2 / 2 » et l'en-tête deux fois",
    async (_, draw) => {
      const text = pdfText(await draw(longNote()));

      expect(text).toContain("Page 1 / 2");
      expect(text).toContain("Page 2 / 2");
      expect(text).not.toContain("Page 3 / ");
      expect(count(text, "BON DE LIVRAISON")).toBe(2);
      expect(text).toContain("Pain n° 21");
    },
  );

  it("un BL d'une page porte « Page 1 / 1 »", async () => {
    const text = pdfText(
      await renderCarrierNotePdf(carrierNoteOf(handedOverNote(), HEAD), DELIVERY_ART),
    );

    expect(text).toContain("Page 1 / 1");
  });
});
