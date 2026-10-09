import type { ClientSheet } from "@lfd/contracts";

import { HANDOVER_QR_CAPTION, renderOrderSheetPdf } from "../order-sheet-pdf.js";
import { ART, LINE, sheet } from "./client-sheet.fixture.js";
import { pdfText } from "./pdf-text.js";

/**
 * Le bon du 2026-10-09 (plan `documentation/order/plan-bon-public.md`) : le
 * logo et les mentions retirées pour tous, le bon PUBLIC d'une commande sans
 * société, et le QR de retrait dans le papier — retrait seulement.
 */

/** 118,40 € HT → 124,91 € TTC à 5,5 %, et 0,74 € la pièce → 0,78 €. */
const SEALED = { ...LINE, unitPriceTtcCents: 78, lineTotalTtcCents: 12_491 };

/** Une commande de particulier : sans société, TTC scellé, sans remise. */
function publicSheet(overrides: Partial<ClientSheet> = {}): ClientSheet {
  return sheet({
    variant: "public",
    customer: { tradeName: "Camille Martin", legalName: "Camille Martin" },
    customerPhone: "06 12 34 56 78",
    lines: [SEALED],
    money: {
      ...sheet().money,
      discountCents: 0,
      vatCents: 651,
      vatShares: [{ rate: 5.5, amountCents: 651 }],
      totalCents: 12_491,
    },
    ...overrides,
  });
}

const URL_OF_HANDOVER = "https://admin.lfc.test/retrait/tok_secret_42";
const WITH_QR = { ...ART, handoverUrl: URL_OF_HANDOVER };

const text = async (sheetToDraw: ClientSheet, art = ART): Promise<string> =>
  pdfText(await renderOrderSheetPdf(sheetToDraw, art));

describe("le dessin, pour tous", () => {
  it.each([
    ["pro", sheet()],
    ["public", publicSheet()],
  ] as const)("%s : sans les mentions retirées, et « pas une facture » reste", async (_, s) => {
    const printed = await text(s);

    expect(printed).not.toContain("EXEMPLAIRE CHIFFR");
    expect(printed).not.toContain("Exemplaire chiffr");
    expect(printed).not.toContain("Reçu par");
    expect(printed).not.toContain("La Folie Coffee — B2B");
    expect(printed).toContain("pas une facture");
    expect(printed).toContain("BON DE COMMANDE");
  });

  it("embarque le logo comme une image", async () => {
    const raw = (await renderOrderSheetPdf(sheet(), ART)).toString("latin1");

    expect(raw).toContain("/Subtype /Image");
  });
});

describe("le bon public", () => {
  it("ne porte ni SKU, ni hors taxe, ni révision, ni phrase légale", async () => {
    const printed = await text(publicSheet());

    expect(printed).not.toContain("PAI-BAG-TRA");
    expect(printed).not.toContain("SKU");
    expect(printed).not.toContain("HT");
    expect(printed).not.toContain("Total avant TVA");
    expect(printed).not.toContain("révision");
    expect(printed).not.toContain("Aucun numéro de série");
  });

  it("dit le nom, le téléphone, les articles et le Total TTC, puis la TVA", async () => {
    const printed = await text(publicSheet());

    expect(printed).toContain("Camille Martin");
    expect(printed).toContain("Tél. 06 12 34 56 78");
    expect(printed).toContain("PU TTC");
    expect(printed).toContain("Articles");
    expect(printed).toContain("124,91");
    expect(printed).toContain("Total TTC");
    expect(printed).toContain("dont TVA 5,5 %");
    expect(printed).toContain("Arrêté le 2 septembre 2026");
    // Le Total TTC est posé AVANT « dont TVA » : on lit le prix, puis ce qu'il contient.
    expect(printed.indexOf("Total TTC", printed.indexOf("Articles"))).toBeLessThan(
      printed.indexOf("dont TVA"),
    );
  });

  it("n'imprime pas de ligne de téléphone quand l'acheteur n'en a pas", async () => {
    expect(await text(publicSheet({ customerPhone: null }))).not.toContain("Tél.");
  });
});

describe("le bon pro, inchangé", () => {
  it("garde la colonne SKU, le sous-total HT, la révision", async () => {
    const printed = await text(sheet());

    expect(printed).toContain("PAI-BAG-TRA");
    expect(printed).toContain("Sous-total HT");
    expect(printed).toContain("révision 0");
    expect(printed).toContain("Hôtel des Trois Ponts");
  });

  it("au compte (F5) : le HT seul, et la mention", async () => {
    const printed = await text(sheet({ money: { ...sheet().money, settlement: "account" } }));

    expect(printed).toContain("Total HT");
    expect(printed).toContain("TVA et TTC sur la facture du mois.");
    expect(printed).not.toContain("Total TTC");
  });
});

describe("le QR de retrait", () => {
  it("est dessiné en retrait avec une URL, sans que l'URL s'imprime en clair", async () => {
    const printed = await text(publicSheet(), WITH_QR);

    expect(printed).toContain(HANDOVER_QR_CAPTION);
    expect(printed).not.toContain("tok_secret_42");
    expect(printed).not.toContain("retrait/");
  });

  it("change les octets du bon : le QR est bien dans le document", async () => {
    const without = await renderOrderSheetPdf(publicSheet(), ART);
    const withQr = await renderOrderSheetPdf(publicSheet(), WITH_QR);

    expect(withQr.equals(without)).toBe(false);
  });

  it("n'est JAMAIS sur une livraison — le papier voyage dans le carton", async () => {
    const delivery = publicSheet({
      fulfillment: { ...publicSheet().fulfillment, method: "delivery" },
    });
    const withUrl = await renderOrderSheetPdf(delivery, WITH_QR);
    const withoutUrl = await renderOrderSheetPdf(delivery, ART);

    expect(pdfText(withUrl)).not.toContain(HANDOVER_QR_CAPTION);
    expect(withUrl.equals(withoutUrl)).toBe(true);
  });

  it("n'est pas dessiné sans URL (pas de jeton, ou pas d'origine admin)", async () => {
    expect(await text(publicSheet(), ART)).not.toContain(HANDOVER_QR_CAPTION);
  });

  it("garde le déterminisme : même jeton, même révision, mêmes octets", async () => {
    const first = await renderOrderSheetPdf(publicSheet(), WITH_QR);
    const second = await renderOrderSheetPdf(publicSheet(), WITH_QR);

    expect(first.equals(second)).toBe(true);
  });
});
