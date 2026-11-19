import type {
  ExceededItemLimit,
  LineVerdict,
  OrderDeadlineVerdict,
} from "../../../../../order-cutoffs/index.js";
import { ItemLimitPassedOnRevisionError } from "../../../../domain/errors/item-limit-override-errors.js";
import type { ItemLimitOverride } from "../../../../domain/services/item-limit-overrides.js";
import { admitRaisedLines, raisedSkus, settledSkusOn } from "../revision-item-limits.js";

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

describe("admitRaisedLines — la limite d'article des lignes ajoutées par l'équipe", () => {
  const LINES = [{ sku: "PAIN", productName: "Pain au levain" }];

  it("refuse en nommant le produit une ligne que sa limite ferme, non dépassée", () => {
    const judged = verdict([["PAIN", line({ itemStatus: "closed", status: "closed" })]]);

    expect(() => admitRaisedLines(judged, LINES)).toThrow(ItemLimitPassedOnRevisionError);
    expect(() => admitRaisedLines(judged, LINES)).toThrow("« Pain au levain »");
  });

  it("rend le dépassement d'une ligne dépassée", () => {
    const passed: ExceededItemLimit = {
      sku: "PAIN",
      rule: { daysBefore: 3, time: "12:00", graceMinutes: 0 },
      limit: LIMIT,
    };
    const judged = verdict(
      [["PAIN", line({ itemStatus: "closed", exceeded: true, exceedable: true })]],
      [passed],
    );

    expect(admitRaisedLines(judged, LINES)).toEqual([passed]);
  });

  it("laisse passer sans rien rendre une ligne que sa limite n'oppose pas, règle générale fermée ou non", () => {
    const judged = verdict([["PAIN", line({ status: "closed", source: "general_rule" })]]);

    expect(admitRaisedLines(judged, LINES)).toEqual([]);
  });
});
