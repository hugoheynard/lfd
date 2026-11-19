import type { ExceededItemLimit } from "../../../../order-cutoffs/index.js";
import {
  ItemLimitOverrideReasonInvalidError,
  ItemLimitReasonRequiredError,
} from "../../errors/item-limit-override-errors.js";
import { itemLimitOverridesOf, justifyItemLimitOverrides } from "../item-limit-overrides.js";

/** Dates comparées entre elles seulement : aucune horloge ici. */
const LIMIT = new Date("2026-08-10T10:00:00.000Z");
const AT = new Date("2026-08-11T08:00:00.000Z");

const LEVAIN: ExceededItemLimit = {
  sku: "LEV-001",
  rule: { daysBefore: 2, time: "12:00", graceMinutes: 0 },
  limit: LIMIT,
};
const BRIOCHE: ExceededItemLimit = {
  sku: "BRI-001",
  rule: { daysBefore: 0, time: "09:30", graceMinutes: 0 },
  limit: LIMIT,
};
const LINES = [
  { sku: "LEV-001", productName: "Pain au levain" },
  { sku: "BRI-001", productName: "Brioche" },
];

describe("le motif d'un dépassement", () => {
  it("n'est pas demandé quand rien n'est dépassé, et un motif envoyé est ignoré", () => {
    expect(justifyItemLimitOverrides([], undefined, LINES)).toBeNull();
    expect(justifyItemLimitOverrides([], "Par précaution", LINES)).toBeNull();
  });

  it("est exigé dès qu'une limite est passée, en nommant chaque produit et sa limite", () => {
    expect(() => justifyItemLimitOverrides([LEVAIN, BRIOCHE], undefined, LINES)).toThrow(
      new ItemLimitReasonRequiredError([
        { productName: "Pain au levain", daysBefore: 2, time: "12:00" },
        { productName: "Brioche", daysBefore: 0, time: "09:30" },
      ]),
    );
    try {
      justifyItemLimitOverrides([LEVAIN, BRIOCHE], undefined, LINES);
    } catch (error: unknown) {
      expect((error as ItemLimitReasonRequiredError).message).toBe(
        "« Pain au levain » se commande 2 jours avant, 12 h ; « Brioche » se commande le jour même, 9 h 30 : indiquez pourquoi vous passez outre.",
      );
    }
  });

  it("nomme le SKU d'un produit absent des lignes plutôt que rien", () => {
    expect(() => justifyItemLimitOverrides([LEVAIN], undefined, [])).toThrow(/« LEV-001 »/);
  });

  it("refuse un motif blanc ou trop long, et rend le motif nettoyé", () => {
    expect(() => justifyItemLimitOverrides([LEVAIN], "   ", LINES)).toThrow(
      ItemLimitOverrideReasonInvalidError,
    );
    expect(() => justifyItemLimitOverrides([LEVAIN], "x".repeat(281), LINES)).toThrow(
      ItemLimitOverrideReasonInvalidError,
    );
    expect(justifyItemLimitOverrides([LEVAIN], "  Salon  ", LINES)).toBe("Salon");
  });
});

describe("la trace des dépassements", () => {
  it("écrit une ligne par SKU dépassé, avec la limite telle qu'elle jugeait", () => {
    let n = 0;
    const traces = itemLimitOverridesOf({
      exceeded: [LEVAIN, BRIOCHE],
      orderId: "ord_1",
      staffUserId: "staff_1",
      reason: "Salon",
      serviceDay: "2026-08-12",
      origin: "placement",
      at: AT,
      nextId: () => `ovr_${++n}`,
    });
    expect(traces).toEqual([
      expect.objectContaining({ id: "ovr_1", sku: "LEV-001", daysBefore: 2, time: "12:00" }),
      expect.objectContaining({ id: "ovr_2", sku: "BRI-001", daysBefore: 0, time: "09:30" }),
    ]);
    expect(traces[0]).toMatchObject({
      orderId: "ord_1",
      staffUserId: "staff_1",
      reason: "Salon",
      serviceDay: "2026-08-12",
      limitAt: LIMIT,
      origin: "placement",
      createdAt: AT,
    });
  });
});
