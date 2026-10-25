import { checkJournalFact } from "../index.js";

/**
 * Quantités changées après l'arrêt du plan (plan A2, § 7) : les deux faits des
 * ateliers. Jours recopiés, jamais comparés à l'horloge.
 */
const DAY = "2030-03-12";
const LINE = { sku: "BAG", productName: "Baguette", from: 10, to: 12 };

describe("les faits d'une commande révisée après l'arrêt (plan A2)", () => {
  it("le fournil : la journée, la commande sous sa référence figée, et ce qui a monté", () => {
    const fact = {
      subjectLabel: DAY,
      serviceDay: DAY,
      orderId: "o1",
      orderNumber: "ORD-1",
      lines: [LINE],
    };

    expect(checkJournalFact("production_day.order_quantities_raised", fact)).toBeNull();
    expect(
      checkJournalFact("production_day.order_quantities_raised", { ...fact, lines: [] }),
    ).not.toBeNull();
  });

  it("le colisage : la feuille, et ses lignes dues de → à", () => {
    const fact = { subjectLabel: "ORD-1", serviceDay: DAY, lines: [{ ...LINE, to: 3 }] };

    expect(checkJournalFact("packing_sheet.revised", fact)).toBeNull();
    expect(
      checkJournalFact("packing_sheet.revised", { ...fact, lines: [{ ...LINE, from: -1 }] }),
    ).not.toBeNull();
  });
});
