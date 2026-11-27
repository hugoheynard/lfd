import type { SheetCustomer } from "@lfd/contracts";

import { view } from "../../../../orders/application/handlers/__tests__/order-placed-mail-doubles.js";
import type { OwnedOrder } from "../../../../orders/domain/ports/order.reader.js";
import { ART } from "../../../../orders/domain/services/__tests__/client-sheet.fixture.js";
import { pdfText } from "../../../../orders/domain/services/__tests__/pdf-text.js";
import { renderOrderSheetPdf } from "../../../../orders/domain/services/order-sheet-pdf.js";
import { AT_PLACEMENT, clientSheetOf } from "../../../../orders/domain/services/order-sheet.js";
import { renderClientNotePdf } from "../../../domain/services/delivery-note-pdf.js";
import { clientNoteOf } from "../../../domain/services/delivery-note-sheet.js";
import { handedOverNote } from "../../../domain/services/__tests__/delivery-note-sheet.fixture.js";
import { orderPartsOf } from "../delivery-note-documents.js";

/**
 * Le client sur le bon de commande du client et sur le BL qui le reprend :
 * l'enseigne en tête, la raison sociale dessous — une seule ligne quand les
 * deux se confondent, et le public inchangé.
 */

const LEGAL = "SARL Trois Ponts";
const TRADE = "Hotel des Trois Ponts";

function owned(companyId: string | null, billedCustomer: SheetCustomer | null): OwnedOrder {
  return {
    view: view({
      id: "ord_1",
      orderNumber: "ORD-1042",
      companyId,
      customerLabel: companyId === null ? "Camille Martin" : LEGAL,
    }),
    companyId,
    placedByUserId: "user_buyer",
    stripePaymentIntentId: null,
    clientele: companyId === null ? "public" : "pro",
    entryOrigin: null,
    loyaltyVoucherId: null,
    billedCustomer,
    buyerPhone: null,
    revision: AT_PLACEMENT,
  };
}

const count = (text: string, needle: string): number => text.split(needle).length - 1;

async function noteText(order: OwnedOrder): Promise<string> {
  const parts = orderPartsOf(order);
  const note = clientNoteOf(handedOverNote(), parts.head, parts.billing);
  return pdfText(await renderClientNotePdf(note, { logo: ART.logo }));
}

async function sheetText(order: OwnedOrder): Promise<string> {
  const sheet = clientSheetOf(order.view, order.billedCustomer, order.buyerPhone, order.revision);
  return pdfText(await renderOrderSheetPdf(sheet, ART));
}

describe("le client sur le bon du client et sur le BL", () => {
  it("une enseigne distincte : deux lignes, l'enseigne puis la raison sociale", async () => {
    const order = owned("co_1", { tradeName: TRADE, legalName: LEGAL });

    expect(orderPartsOf(order).head.customer).toEqual({ tradeName: TRADE, legalName: LEGAL });
    for (const text of [await noteText(order), await sheetText(order)]) {
      expect(text).toContain(TRADE);
      expect(text).toContain(LEGAL);
    }
  });

  it("une enseigne égale à la raison sociale : une seule ligne", async () => {
    const order = owned("co_1", { tradeName: LEGAL, legalName: LEGAL });

    expect(count(await noteText(order), LEGAL)).toBe(1);
    expect(count(await sheetText(order), LEGAL)).toBe(1);
  });

  it("le public : la personne, inchangée", async () => {
    const order = owned(null, null);

    expect(orderPartsOf(order).head.customer).toEqual({
      tradeName: "Camille Martin",
      legalName: "Camille Martin",
    });
    expect(count(await noteText(order), "Camille Martin")).toBe(1);
  });

  it("facturée à une autre société : le site en tête, le payeur dessous", async () => {
    const order = owned("co_site", { tradeName: TRADE, legalName: "SAS Principal" });
    const text = await noteText(order);

    expect(text).toContain(TRADE);
    expect(text).toContain("SAS Principal");
  });
});
