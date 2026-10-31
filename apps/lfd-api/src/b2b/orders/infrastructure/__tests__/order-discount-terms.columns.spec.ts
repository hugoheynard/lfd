import type { FrozenDiscountTerms } from "../../domain/services/frozen-discount-terms.js";
import { frozenTermsData, frozenTermsOf } from "../order-discount-terms.columns.js";

/**
 * **Les termes figés d'une remise, ligne ↔ domaine**
 * (`documentation/promotions/plan-remises-acquises.md`, § 10.3).
 */

const LISTED: FrozenDiscountTerms = {
  cumulative: true,
  minQuantity: 10,
  pickup: { points: ["p1", "p2"] },
  delivery: "none",
  origin: "placed",
  hours: null,
};

describe("frozenTermsData / frozenTermsOf", () => {
  it("relit ce qu'il écrit, sélection comprise", () => {
    expect(frozenTermsOf("od_1", frozenTermsData(LISTED))).toEqual(LISTED);
  });

  it("écrit des termes inconnus comme des colonnes toutes à NULL, et les relit à `null`", () => {
    const data = frozenTermsData(null);

    expect(data).toEqual({
      cumulative: null,
      minQuantity: null,
      fulfillmentPickup: null,
      fulfillmentDelivery: null,
      fulfillmentPickupPoints: [],
      fulfillmentDeliveryZones: [],
      frozenTermsOrigin: null,
    });
    expect(frozenTermsOf("od_1", data)).toBeNull();
  });

  it("relit une remise reprise (`backfilled`) à toutes les zones", () => {
    const backfilled = { ...LISTED, delivery: "all" as const, origin: "backfilled" as const };

    expect(frozenTermsOf("od_1", frozenTermsData(backfilled))).toEqual(backfilled);
  });

  it("refuse, en le nommant, un acheminement que les CHECK auraient dû refuser", () => {
    const broken = { ...frozenTermsData(LISTED), fulfillmentDelivery: "partout" };

    expect(() => frozenTermsOf("od_9", broken)).toThrow(/od_9.*acheminement « partout »/u);
  });

  it("relit les jours et heures figés (plan jours et heures, § 11)", () => {
    const hours: FrozenDiscountTerms = {
      ...LISTED,
      hours: {
        kind: "weekly_hours",
        moment: "handover_at",
        announceOutside: true,
        windows: [{ weekdays: ["tue", "thu"], start: "07:00", end: "09:00" }],
      },
    };

    expect(frozenTermsOf("od_1", frozenTermsData(hours))).toEqual(hours);
  });

  it("refuse, en le nommant, des jours et heures illisibles", () => {
    const broken = { ...frozenTermsData(LISTED), weeklyHours: { kind: "weekly_hours" } };

    expect(() => frozenTermsOf("od_9", broken)).toThrow(/od_9.*jours et heures/u);
  });
});
