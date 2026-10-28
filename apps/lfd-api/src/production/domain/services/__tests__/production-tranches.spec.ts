import { type DueNeed, rangeInTranches, type SkuNeeds } from "../production-tranches.js";

const TRANCHES = ["05:00", "07:00", "12:00"];

function deadline(before: string, quantity: number): DueNeed {
  return { kind: "deadline", before, quantity, cumulative: 0 };
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

function fixed(line: SkuNeeds<DueNeed>, tranches: readonly string[] = TRANCHES) {
  return rangeInTranches([line], "fixed", tranches)[0]?.thresholds;
}

describe("rangeInTranches — mode fixe (plan des tranches, §2.1)", () => {
  it("06:40 va à 05:00 : 07:00 serait trop tard", () => {
    expect(fixed(croissant(deadline("06:40", 10)))).toEqual([
      { kind: "deadline", before: "05:00", quantity: 10, cumulative: 10 },
    ]);
  });

  it("07:00 va à 07:00 : pile à l'heure", () => {
    expect(fixed(croissant(deadline("07:00", 10)))).toEqual([
      { kind: "deadline", before: "07:00", quantity: 10, cumulative: 10 },
    ]);
  });

  it("11:15 va à 07:00 : 12:00 serait trop tard", () => {
    expect(fixed(croissant(deadline("11:15", 4)))?.[0]?.before).toBe("07:00");
  });

  it("04:30 va à la première tranche, signalé avec l'heure du plus pressé", () => {
    expect(fixed(croissant(deadline("04:00", 20), deadline("04:30", 100)))).toEqual([
      { kind: "before_first", before: "05:00", quantity: 120, cumulative: 120, earliest: "04:00" },
    ]);
  });

  it("additionne dans une tranche et recalcule les cumuls — la phrase de Hugo", () => {
    const line = croissant(
      deadline("05:10", 400),
      deadline("07:00", 300),
      deadline("09:30", 500),
      deadline("12:00", 800),
    );

    expect(fixed(line)).toEqual([
      { kind: "deadline", before: "05:00", quantity: 400, cumulative: 400 },
      { kind: "deadline", before: "07:00", quantity: 800, cumulative: 1200 },
      { kind: "deadline", before: "12:00", quantity: 800, cumulative: 2000 },
    ]);
  });

  it("les sans-échéance restent derniers, après l'avant-première", () => {
    const line = croissant(deadline("04:30", 5), deadline("07:20", 3), {
      kind: "undated",
      before: null,
      quantity: 2,
      cumulative: 0,
    });

    expect(fixed(line)).toEqual([
      { kind: "before_first", before: "05:00", quantity: 5, cumulative: 5, earliest: "04:30" },
      { kind: "deadline", before: "07:00", quantity: 3, cumulative: 8 },
      { kind: "undated", before: null, quantity: 2, cumulative: 10 },
    ]);
  });

  it("aucune heure réglée : une seule tranche, la journée", () => {
    const line = croissant(deadline("06:40", 10), {
      kind: "undated",
      before: null,
      quantity: 2,
      cumulative: 0,
    });

    expect(fixed(line, [])).toEqual([{ kind: "day", before: null, quantity: 12, cumulative: 12 }]);
  });

  it("marges non réglées (`day`) : rendu tel quel, quelles que soient les heures", () => {
    const line = croissant({ kind: "day", before: null, quantity: 7, cumulative: 0 });

    expect(fixed(line)).toEqual(line.thresholds);
  });

  it("trie les heures reçues dans le désordre", () => {
    expect(fixed(croissant(deadline("06:40", 1)), ["12:00", "07:00", "05:00"])?.[0]?.before).toBe(
      "05:00",
    );
  });
});

describe("rangeInTranches — mode calculé", () => {
  it("rend les seuils du commerce tels quels, heures fixes ignorées", () => {
    const line = croissant(deadline("04:30", 5), deadline("06:40", 3));

    expect(rangeInTranches([line], "computed", TRANCHES)).toEqual([line]);
  });
});
