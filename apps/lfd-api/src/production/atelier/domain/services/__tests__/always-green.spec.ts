import { localToInstant } from "@lfd/contracts";

import {
  type AlwaysGreenLine,
  alwaysGreenStep,
  dueCumulative,
  hasTimedDeadline,
  unautomatedRemainder,
} from "../always-green.js";

/**
 * La fournée automatique (`fournil/les-niveaux-de-suivi.md`) :
 * paliers échus à l'heure plus la marge, bornés par le compte et le plafond,
 * moins le sorti ; l'`id` suit le nombre de fournées. Les dates ne sont
 * comparées qu'à un instant construit sur la même journée.
 */
const DAY = "2030-03-12";
const at = (time: string): Date => {
  const instant = localToInstant(DAY, time);
  if (instant === null) {
    throw new RangeError(`heure ${time} introuvable le ${DAY}`);
  }
  return instant;
};

const LINE: AlwaysGreenLine = {
  serviceDay: DAY,
  sku: "CRO",
  counted: 200,
  deadlines: [
    { quantity: 120, before: "07:00" },
    { quantity: 80, before: "11:00" },
  ],
  marginMinutes: 15,
  ceiling: null,
  output: 0,
  batchCount: 0,
};

describe("alwaysGreenStep", () => {
  it("avant l'heure plus la marge, rien n'est échu", () => {
    expect(alwaysGreenStep(LINE, at("07:14"))).toEqual({ kind: "nothing" });
  });

  it("le premier palier échu à son heure plus la marge", () => {
    expect(alwaysGreenStep(LINE, at("07:15"))).toEqual({
      kind: "record",
      batchId: `auto-${DAY}-CRO-0`,
      quantity: 120,
    });
  });

  it("les paliers échus se cumulent", () => {
    expect(alwaysGreenStep(LINE, at("12:00"))).toMatchObject({ quantity: 200 });
  });

  it("le sorti, part corrigée déduite par l'appelant, est retranché", () => {
    expect(alwaysGreenStep({ ...LINE, output: 100 }, at("07:30"))).toMatchObject({
      quantity: 20,
    });
  });

  it("le compte borne la cible quand les paliers le dépassent", () => {
    expect(alwaysGreenStep({ ...LINE, counted: 150 }, at("12:00"))).toMatchObject({
      quantity: 150,
    });
  });

  it("le plafond d'un rouge borne la cible", () => {
    expect(alwaysGreenStep({ ...LINE, ceiling: 80, output: 0 }, at("12:00"))).toMatchObject({
      quantity: 80,
    });
    expect(alwaysGreenStep({ ...LINE, ceiling: 80, output: 80 }, at("12:00"))).toEqual({
      kind: "nothing",
    });
  });

  it("l'id suit le nombre de fournées, annulées comprises", () => {
    expect(alwaysGreenStep({ ...LINE, batchCount: 3, output: 120 }, at("12:00"))).toEqual({
      kind: "record",
      batchId: `auto-${DAY}-CRO-3`,
      quantity: 80,
    });
  });

  it("une ligne sans palier à heure, ou des paliers illisibles, reste à confirmer", () => {
    expect(
      alwaysGreenStep({ ...LINE, deadlines: [{ quantity: 200, before: null }] }, at("23:00")),
    ).toEqual({ kind: "no_deadline" });
    expect(alwaysGreenStep({ ...LINE, deadlines: [] }, at("23:00"))).toEqual({
      kind: "no_deadline",
    });
    expect(alwaysGreenStep({ ...LINE, deadlines: null }, at("23:00"))).toEqual({
      kind: "no_deadline",
    });
  });
});

describe("dueCumulative et hasTimedDeadline", () => {
  it("un palier « la journée » n'échoit jamais", () => {
    const steps = [
      { quantity: 50, before: "06:00" },
      { quantity: 30, before: null },
    ];

    expect(dueCumulative(DAY, steps, 0, at("23:59"))).toBe(50);
    expect(hasTimedDeadline(steps)).toBe(true);
    expect(hasTimedDeadline(null)).toBe(false);
  });
});

describe("unautomatedRemainder — ce que la fournée automatique ne complétera pas", () => {
  /**
   * Régression : une ligne de 10 pièces à heure et 5 « la journée » voyait ses
   * 10 déclarées, et ses 5 n'étaient nulle part — ni sorties, ni à confirmer.
   */
  it("le reste « la journée » à côté de paliers à heure reste à confirmer", () => {
    const deadlines = [
      { quantity: 10, before: "08:00" },
      { quantity: 5, before: null },
    ];
    expect(unautomatedRemainder({ counted: 15, deadlines, ceiling: null, output: 10 })).toBe(5);
    expect(unautomatedRemainder({ counted: 15, deadlines, ceiling: null, output: 0 })).toBe(5);
  });

  it("une ligne toute à heure n'a rien à confirmer", () => {
    const deadlines = [{ quantity: 15, before: "08:00" }];
    expect(unautomatedRemainder({ counted: 15, deadlines, ceiling: null, output: 0 })).toBe(0);
  });

  it("une ligne sans palier à heure, ou illisible, est toute à confirmer", () => {
    expect(
      unautomatedRemainder({
        counted: 15,
        deadlines: [{ quantity: 15, before: null }],
        ceiling: null,
        output: 4,
      }),
    ).toBe(11);
    expect(unautomatedRemainder({ counted: 15, deadlines: null, ceiling: null, output: 0 })).toBe(
      15,
    );
  });

  it("le plafond d'un rouge borne le reste", () => {
    const deadlines = [
      { quantity: 10, before: "08:00" },
      { quantity: 5, before: null },
    ];
    expect(unautomatedRemainder({ counted: 15, deadlines, ceiling: 12, output: 10 })).toBe(2);
    expect(unautomatedRemainder({ counted: 15, deadlines, ceiling: 8, output: 0 })).toBe(0);
  });

  it("au-delà des paliers à heure déjà sorti, il ne reste que ce qui manque au compte", () => {
    const deadlines = [
      { quantity: 10, before: "08:00" },
      { quantity: 5, before: null },
    ];
    expect(unautomatedRemainder({ counted: 15, deadlines, ceiling: null, output: 13 })).toBe(2);
    expect(unautomatedRemainder({ counted: 15, deadlines, ceiling: null, output: 15 })).toBe(0);
  });
});
