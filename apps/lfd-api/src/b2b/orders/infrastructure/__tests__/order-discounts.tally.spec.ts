import { OrderDiscountsTally } from "../order-discounts.tally.js";

describe("OrderDiscountsTally", () => {
  it("rien à faire : zéro écrivable, zéro à trancher", () => {
    expect(new OrderDiscountsTally().report()).toMatchObject({
      writable: 0,
      byHand: 0,
      sample: [],
    });
  });

  it("compte comme écrivables les remises recréées, les périmées reprises ou archivées, et les termes déduits", () => {
    const tally = new OrderDiscountsTally();
    tally.missing({ orderNumber: "C-1", outcome: { kind: "computed", gap: null } });
    tally.missing({ orderNumber: "C-2", outcome: { kind: "frozen", gap: "écart" } });
    tally.missing({ orderNumber: "C-3", outcome: { kind: "already" } });
    tally.drifted({ orderNumber: "C-4", outcome: { kind: "archived" } });
    tally.terms({ orderNumber: "C-5", orderDiscountId: "d5", outcome: { kind: "backfilled" } });

    expect(tally.report()).toMatchObject({ writable: 4, byHand: 0 });
  });

  it("liste à la main les cas « à trancher » et « illisibles », sans les compter à faire", () => {
    const tally = new OrderDiscountsTally();
    tally.missing({ orderNumber: "C-1", outcome: { kind: "undecided", reason: "plusieurs taux" } });
    tally.drifted({ orderNumber: "C-2", outcome: { kind: "unreadable", reason: "colonne" } });
    tally.terms({
      orderNumber: "C-3",
      orderDiscountId: "d3",
      outcome: { kind: "undecided", reason: "promotion introuvable" },
    });

    expect(tally.report()).toMatchObject({
      writable: 0,
      byHand: 3,
      sample: [
        "À trancher — C-1 : plusieurs taux",
        "Illisible — C-2 : colonne",
        "Termes à trancher — C-3 : promotion introuvable",
      ],
    });
  });
});
