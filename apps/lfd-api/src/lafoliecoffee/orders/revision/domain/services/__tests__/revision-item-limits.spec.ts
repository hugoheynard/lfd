import type {
  ExceededItemLimit,
  LineVerdict,
  OrderDeadlineVerdict,
} from "../../../../../order-cutoffs/index.js";
import { ItemLimitPassedOnRevisionError } from "../../../../domain/errors/item-limit-override-errors.js";
import type { ItemLimitOverride } from "../../../../domain/services/item-limit-overrides.js";
import {
  admitStaffItemLimits,
  raisedSkus,
  settledSkusOn,
  staffItemLimitsOf,
  staffJudgedSkus,
} from "../revision-item-limits.js";

/**
 * La limite d'article dans une modification (plan
 * `documentation/limites-de-commande/passer-outre-la-limite-d-un-produit.md`,
 * § 3.6). Les dates ne sont comparées qu'entre elles : aucune horloge.
 */
const DAY = "2026-12-10";
const OTHER_DAY = "2026-12-11";
const LIMIT = new Date("2026-12-07T11:00:00.000Z");

function line(over: Partial<LineVerdict> = {}): LineVerdict {
  return {
    status: "open",
    source: "none",
    limit: null,
    itemStatus: "open",
    itemLimit: null,
    exceeded: false,
    exceedable: false,
    ...over,
  };
}

function verdict(
  lines: readonly (readonly [string, LineVerdict])[],
  exceeded: readonly ExceededItemLimit[] = [],
): OrderDeadlineVerdict {
  return {
    kind: "open",
    limit: null,
    graceEnd: null,
    source: "none",
    lines: new Map(lines),
    exceeded,
  };
}

function consigned(sku: string, serviceDay: string): ItemLimitOverride {
  return {
    id: `ovr_${sku}`,
    orderId: "ord_1",
    sku,
    staffUserId: "stf_1",
    reason: "Salon",
    serviceDay,
    daysBefore: 3,
    time: "12:00",
    limitAt: LIMIT,
    origin: "placement",
    createdAt: LIMIT,
  };
}

describe("raisedSkus — les lignes ajoutées ou augmentées", () => {
  it("rend un SKU absent avant, et un SKU dont la quantité monte", () => {
    expect(
      raisedSkus(
        [
          { sku: "PAIN", quantity: 2 },
          { sku: "CROISSANT", quantity: 10 },
        ],
        [
          { sku: "PAIN", quantity: 3 },
          { sku: "CROISSANT", quantity: 10 },
          { sku: "BRIOCHE", quantity: 1 },
        ],
      ),
    ).toEqual(["PAIN", "BRIOCHE"]);
  });

  it("ne rend ni une ligne gardée, ni une ligne réduite, ni une ligne retirée", () => {
    expect(
      raisedSkus(
        [
          { sku: "PAIN", quantity: 2 },
          { sku: "CROISSANT", quantity: 10 },
          { sku: "BRIOCHE", quantity: 1 },
        ],
        [
          { sku: "PAIN", quantity: 2 },
          { sku: "CROISSANT", quantity: 4 },
        ],
      ),
    ).toEqual([]);
  });

  it("additionne les lignes d'un même SKU avant de comparer", () => {
    expect(
      raisedSkus(
        [{ sku: "PAIN", quantity: 4 }],
        [
          { sku: "PAIN", quantity: 2 },
          { sku: "PAIN", quantity: 2 },
        ],
      ),
    ).toEqual([]);
    expect(
      raisedSkus(
        [{ sku: "PAIN", quantity: 4 }],
        [
          { sku: "PAIN", quantity: 3 },
          { sku: "PAIN", quantity: 2 },
        ],
      ),
    ).toEqual(["PAIN"]);
  });
});

describe("staffJudgedSkus — ce qu'une modification de l'équipe soumet à la limite d'article", () => {
  const lines = [
    { sku: "LEV", quantity: 2 },
    { sku: "PAIN", quantity: 3 },
  ];

  it("à journée inchangée, les seules lignes ajoutées ou augmentées", () => {
    expect(
      staffJudgedSkus(
        { serviceDay: "2026-12-10", lines },
        { serviceDay: "2026-12-10", lines: [...lines, { sku: "BRI", quantity: 1 }] },
      ),
    ).toEqual(["BRI"]);
  });

  it("quand la journée change, toutes les lignes, même gardées telles quelles", () => {
    expect(
      staffJudgedSkus({ serviceDay: "2026-12-10", lines }, { serviceDay: "2026-12-03", lines }),
    ).toEqual(["LEV", "PAIN"]);
  });
});

describe("settledSkusOn — les limites consignées qu'un jugement du client écarte", () => {
  it("écarte un SKU consigné pour cette journée", () => {
    expect([...settledSkusOn(DAY, [consigned("PAIN", DAY)], [])]).toEqual(["PAIN"]);
  });

  it("ne l'écarte pas pour une autre journée", () => {
    expect([...settledSkusOn(OTHER_DAY, [consigned("PAIN", DAY)], [])]).toEqual([]);
  });

  it("ne l'écarte pas quand le client l'augmente : une augmentation se juge comme un ajout", () => {
    expect([...settledSkusOn(DAY, [consigned("PAIN", DAY)], ["PAIN"])]).toEqual([]);
  });
});

describe("staffItemLimitsOf et admitStaffItemLimits — la limite d'article des lignes soumises par l'équipe", () => {
  const LINES = [{ sku: "PAIN", productName: "Pain au levain" }];
  const RULE = { daysBefore: 3, time: "12:00", graceMinutes: 0 };
  const OWN = { rule: RULE, limit: LIMIT };
  const passed: ExceededItemLimit = { sku: "PAIN", ...OWN };

  it("annonce une ligne fermée non dépassable, et la modification la refuse en nommant le produit", () => {
    const limits = staffItemLimitsOf(
      verdict([["PAIN", line({ itemStatus: "closed", status: "closed", itemLimit: OWN })]]),
    );

    expect(limits.closed).toEqual([{ sku: "PAIN", ...OWN, exceedable: false }]);
    expect(() => admitStaffItemLimits(limits, LINES)).toThrow(ItemLimitPassedOnRevisionError);
    expect(() => admitStaffItemLimits(limits, LINES)).toThrow("« Pain au levain »");
  });

  it("annonce une ligne dépassée comme dépassable, et la modification rend le dépassement", () => {
    const limits = staffItemLimitsOf(
      verdict(
        [
          [
            "PAIN",
            line({ itemStatus: "closed", exceeded: true, exceedable: true, itemLimit: OWN }),
          ],
        ],
        [passed],
      ),
    );

    expect(limits.closed).toEqual([{ sku: "PAIN", ...OWN, exceedable: true }]);
    expect(admitStaffItemLimits(limits, LINES)).toEqual([passed]);
  });

  it("dit non dépassable une ligne que le produit permettrait de passer, mais que la règle générale ferme", () => {
    const limits = staffItemLimitsOf(
      verdict([
        ["PAIN", line({ itemStatus: "closed", exceeded: false, exceedable: true, itemLimit: OWN })],
      ]),
    );

    expect(limits.closed.map((closed) => closed.exceedable)).toEqual([false]);
  });

  it("n'annonce ni ne refuse une ligne que sa limite n'oppose pas, règle générale fermée ou non", () => {
    const limits = staffItemLimitsOf(
      verdict([["PAIN", line({ status: "closed", source: "general_rule" })]]),
    );

    expect(limits.closed).toEqual([]);
    expect(admitStaffItemLimits(limits, LINES)).toEqual([]);
  });
});
