import {
  type DeadlineOrder,
  deadlineThresholds,
  type ProductionMargins,
} from "../deadline-thresholds.js";

const MARGINS: ProductionMargins = { deliveryMinutes: 50, pickupMinutes: 20 };

function order(
  fulfillmentMethod: DeadlineOrder["fulfillmentMethod"],
  window: DeadlineOrder["window"],
  lines: Readonly<Record<string, number>>,
): DeadlineOrder {
  return {
    fulfillmentMethod,
    window,
    lines: Object.entries(lines).map(([sku, quantity]) => ({
      sku,
      productName: `Produit ${sku}`,
      quantity,
    })),
  };
}

const before = (end: string) => ({ start: null, end });

describe("deadlineThresholds — le compte à rebours par échéance", () => {
  it("cumule les seuils d'un SKU dans l'ordre des heures, quel que soit l'ordre des commandes", () => {
    const result = deadlineThresholds(
      [
        order("delivery", before("11:20"), { BAG: 25 }),
        order("delivery", before("05:30"), { BAG: 120 }),
        order("delivery", before("09:00"), { BAG: 60 }),
      ],
      MARGINS,
    );

    expect(result).toEqual([
      {
        sku: "BAG",
        productName: "Produit BAG",
        total: 205,
        thresholds: [
          { kind: "deadline", before: "04:40", quantity: 120, cumulative: 120 },
          { kind: "deadline", before: "08:10", quantity: 60, cumulative: 180 },
          { kind: "deadline", before: "10:30", quantity: 25, cumulative: 205 },
        ],
      },
    ]);
  });

  it("fusionne deux commandes qui tombent à la même heure en un seul seuil", () => {
    const [bag] = deadlineThresholds(
      [
        order("delivery", before("07:00"), { BAG: 10 }),
        order("delivery", before("07:00"), { BAG: 5 }),
      ],
      MARGINS,
    );

    expect(bag?.thresholds).toEqual([
      { kind: "deadline", before: "06:10", quantity: 15, cumulative: 15 },
    ]);
  });

  it("fusionne une livraison et un retrait qui, marges retranchées, tombent à la même heure", () => {
    const [bag] = deadlineThresholds(
      [
        order("delivery", before("07:00"), { BAG: 10 }),
        order("pickup", before("06:30"), { BAG: 4 }),
      ],
      MARGINS,
    );

    expect(bag?.thresholds).toEqual([
      { kind: "deadline", before: "06:10", quantity: 14, cumulative: 14 },
    ]);
  });

  it("retranche la marge de son mode : retrait et livraison à la même échéance se séparent", () => {
    const [bag] = deadlineThresholds(
      [
        order("pickup", before("08:00"), { BAG: 3 }),
        order("delivery", before("08:00"), { BAG: 7 }),
      ],
      MARGINS,
    );

    expect(bag?.thresholds.map((t) => [t.before, t.quantity, t.cumulative])).toEqual([
      ["07:10", 7, 7],
      ["07:40", 3, 10],
    ]);
  });

  it("prend le DÉBUT d'un créneau comme échéance, et la fin seulement sans début", () => {
    const [bag] = deadlineThresholds(
      [
        order("pickup", { start: "10:00", end: "12:00" }, { BAG: 2 }),
        order("pickup", before("12:00"), { BAG: 1 }),
      ],
      MARGINS,
    );

    expect(bag?.thresholds.map((t) => t.before)).toEqual(["09:40", "11:40"]);
  });

  it("met les commandes sans échéance dans un dernier seuil, signalé et cumulé", () => {
    const [bag] = deadlineThresholds(
      [
        order("pickup", null, { BAG: 4 }),
        order("delivery", before("06:00"), { BAG: 10 }),
        order("delivery", null, { BAG: 1 }),
      ],
      MARGINS,
    );

    expect(bag?.thresholds).toEqual([
      { kind: "deadline", before: "05:10", quantity: 10, cumulative: 10 },
      { kind: "undated", before: null, quantity: 5, cumulative: 15 },
    ]);
    expect(bag?.total).toBe(15);
  });

  it("ramène à 00:00 une échéance que la marge ferait tomber la veille", () => {
    const [bag] = deadlineThresholds(
      [
        order("delivery", before("00:30"), { BAG: 6 }),
        order("delivery", before("00:50"), { BAG: 2 }),
      ],
      MARGINS,
    );

    expect(bag?.thresholds).toEqual([
      { kind: "deadline", before: "00:00", quantity: 8, cumulative: 8 },
    ]);
  });

  it("tient une échéance juste avant minuit, et une marge nulle", () => {
    const [bag] = deadlineThresholds([order("pickup", before("23:59"), { BAG: 1 })], {
      deliveryMinutes: 0,
      pickupMinutes: 0,
    });

    expect(bag?.thresholds.map((t) => t.before)).toEqual(["23:59"]);
  });

  it("sépare les SKU, triés par code, et somme les lignes d'un même SKU", () => {
    const result = deadlineThresholds(
      [order("delivery", before("07:00"), { CRO: 3, BAG: 2 }), order("pickup", null, { CRO: 1 })],
      MARGINS,
    );

    expect(result.map((item) => [item.sku, item.total])).toEqual([
      ["BAG", 2],
      ["CRO", 4],
    ]);
  });

  describe("sans marge réglée — un seul seuil, la journée", () => {
    it.each<[string, ProductionMargins]>([
      ["aucune", { deliveryMinutes: null, pickupMinutes: null }],
      ["seule la livraison", { deliveryMinutes: 50, pickupMinutes: null }],
      ["seul le retrait", { deliveryMinutes: null, pickupMinutes: 20 }],
    ])("%s", (_label, margins) => {
      const [bag] = deadlineThresholds(
        [order("delivery", before("05:30"), { BAG: 120 }), order("pickup", null, { BAG: 5 })],
        margins,
      );

      expect(bag?.thresholds).toEqual([
        { kind: "day", before: null, quantity: 125, cumulative: 125 },
      ]);
    });
  });

  it("une journée sans commande ne rend rien", () => {
    expect(deadlineThresholds([], MARGINS)).toEqual([]);
  });

  it("une journée sans aucune échéance ne rend que le seuil signalé", () => {
    const [bag] = deadlineThresholds([order("pickup", null, { BAG: 3 })], MARGINS);

    expect(bag?.thresholds).toEqual([
      { kind: "undated", before: null, quantity: 3, cumulative: 3 },
    ]);
  });
});
