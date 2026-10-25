import { checkJournalFact } from "../index.js";

/**
 * Retirée après l'arrêt du plan (plan A1, lot A1.3) : les deux faits des
 * ateliers, et les deux champs ajoutés à `order.cancelled`, lisibles sur les
 * faits d'avant. Jours recopiés, jamais comparés à l'horloge.
 */
const DAY = "2030-03-12";

describe("les faits d'une commande retirée après l'arrêt (plan A1)", () => {
  it("le fournil : la journée, et la commande sous sa référence figée — ou `null`", () => {
    const fact = { subjectLabel: DAY, serviceDay: DAY, orderId: "o1", orderNumber: "C-1" };
    expect(checkJournalFact("production_day.order_withdrawn", fact)).toBeNull();
    expect(
      checkJournalFact("production_day.order_withdrawn", { ...fact, orderNumber: null }),
    ).toBeNull();
  });

  it("le colisage : les lignes rendues à la réserve, vides pour une pierre tombale", () => {
    const fact = {
      subjectLabel: "C-1",
      serviceDay: DAY,
      released: [{ sku: "CRO", productName: "Croissant", quantity: 3 }],
    };
    expect(checkJournalFact("packing_sheet.withdrawn", fact)).toBeNull();
    expect(checkJournalFact("packing_sheet.withdrawn", { ...fact, released: [] })).toBeNull();
    expect(
      checkJournalFact("packing_sheet.withdrawn", {
        ...fact,
        released: [{ sku: "CRO", productName: "Croissant", quantity: -1 }],
      })?.kind,
    ).toBe("invalid_payload");
  });

  it("`order.cancelled` : les deux champs sont facultatifs, et l'étape est fermée", () => {
    const before = {
      subjectLabel: "Paul",
      orderId: "o1",
      orderNumber: "C-1",
      cancelledBy: "fiche_1",
      reason: "appel",
      regime: "due",
      voucher: null,
    };
    expect(checkJournalFact("order.cancelled", before)).toBeNull();
    expect(
      checkJournalFact("order.cancelled", {
        ...before,
        afterInscription: true,
        stageApplied: "ready",
      }),
    ).toBeNull();
    expect(checkJournalFact("order.cancelled", { ...before, stageApplied: "handover" })?.kind).toBe(
      "invalid_payload",
    );
  });
});
