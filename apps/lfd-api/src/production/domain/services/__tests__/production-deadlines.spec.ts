import { deadlinesOf } from "../production-deadlines.js";
import { type DueNeed, rangeInTranches, type SkuNeeds } from "../production-tranches.js";

const TRANCHES = ["05:00", "07:00", "12:00"];

function deadline(before: string, quantity: number): DueNeed {
  return { kind: "deadline", before, quantity, cumulative: 0 };
}

function undated(quantity: number): DueNeed {
  return { kind: "undated", before: null, quantity, cumulative: 0 };
}

/** Un SKU dont les besoins sont donnés dans l'ordre ; les cumuls sont recalculés comme le commerce. */
function croissant(...needs: readonly DueNeed[]): SkuNeeds<DueNeed> {
  let cumulative = 0;
  const thresholds = needs.map((need) => {
    cumulative += need.quantity;
    return { ...need, cumulative };
  });
  return { sku: "CRO", productName: "Croissant", total: cumulative, thresholds };
}

/** Le chemin du serveur : rangées par le réglage, puis passées aux paliers. */
function deadlines(
  quantity: number,
  line: SkuNeeds<DueNeed>,
  mode: "fixed" | "computed" = "fixed",
) {
  const ranged = rangeInTranches([line], mode, TRANCHES)[0]?.thresholds ?? [];
  return deadlinesOf(quantity, ranged);
}

describe("deadlinesOf — les paliers d'une ligne (plan fournée v3, §2)", () => {
  it("rend des paliers NON cumulés, de somme la quantité de la ligne", () => {
    const steps = deadlines(240, croissant(deadline("06:40", 120), deadline("09:30", 120)));

    expect(steps).toEqual([
      { quantity: 120, before: "05:00" },
      { quantity: 120, before: "07:00" },
    ]);
  });

  it("arrondit toujours plus tôt, jamais plus tard : 06:59 va à 05:00", () => {
    expect(deadlines(10, croissant(deadline("06:59", 10)))).toEqual([
      { quantity: 10, before: "05:00" },
    ]);
  });

  it("en mode calculé, garde l'heure de chaque besoin", () => {
    const steps = deadlines(
      30,
      croissant(deadline("06:40", 10), deadline("09:30", 20)),
      "computed",
    );

    expect(steps).toEqual([
      { quantity: 10, before: "06:40" },
      { quantity: 20, before: "09:30" },
    ]);
  });

  it("porte l'écart positif au DERNIER palier", () => {
    expect(deadlines(48, croissant(deadline("06:40", 12), deadline("09:30", 24)))).toEqual([
      { quantity: 12, before: "05:00" },
      { quantity: 36, before: "07:00" },
    ]);
  });

  it("rogne un écart négatif par la fin, sans laisser de palier vide", () => {
    expect(deadlines(10, croissant(deadline("06:40", 8), deadline("09:30", 5)))).toEqual([
      { quantity: 8, before: "05:00" },
      { quantity: 2, before: "07:00" },
    ]);
    expect(deadlines(6, croissant(deadline("06:40", 8), deadline("09:30", 5)))).toEqual([
      { quantity: 6, before: "05:00" },
    ]);
  });

  it("sans échéance connue, un seul palier : la journée, sans heure inventée", () => {
    expect(deadlinesOf(24, [])).toEqual([{ quantity: 24, before: null }]);
  });

  it("les commandes sans échéance restent un palier final sans heure", () => {
    expect(deadlines(30, croissant(deadline("09:30", 20), undated(10)))).toEqual([
      { quantity: 20, before: "07:00" },
      { quantity: 10, before: null },
    ]);
  });

  it("un besoin plus pressé que la première tranche garde l'heure de cette tranche", () => {
    expect(deadlines(15, croissant(deadline("04:30", 5), deadline("09:30", 10)))).toEqual([
      { quantity: 5, before: "05:00" },
      { quantity: 10, before: "07:00" },
    ]);
  });

  it("une ligne de quantité 0 n'a aucun palier", () => {
    expect(deadlinesOf(0, [])).toEqual([]);
  });
});
