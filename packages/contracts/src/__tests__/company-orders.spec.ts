import { describe, expect, it } from "@jest/globals";

import { companyOrderSummaryRequestSchema, companyOrdersQuerySchema } from "../company-orders.js";

/** Plan récapitulatif des commandes, lot R1 (§6.5, §6.6). */
describe("companyOrdersQuerySchema — bornes de date", () => {
  it("prend deux jours AAAA-MM-JJ", () => {
    expect(companyOrdersQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("refuse un jour à un autre format", () => {
    expect(companyOrdersQuerySchema.safeParse({ from: "01/10/2026" }).success).toBe(false);
  });
});

describe("companyOrderSummaryRequestSchema", () => {
  it("format json par défaut", () => {
    expect(companyOrderSummaryRequestSchema.parse({ orderIds: ["o1"] })).toEqual({
      orderIds: ["o1"],
      format: "json",
    });
  });

  it("refuse une sélection vide", () => {
    expect(companyOrderSummaryRequestSchema.safeParse({ orderIds: [] }).success).toBe(false);
  });

  it("refuse un format que le lot R1 ne sert pas encore", () => {
    expect(
      companyOrderSummaryRequestSchema.safeParse({ orderIds: ["o1"], format: "pdf" }).success,
    ).toBe(false);
  });
});
