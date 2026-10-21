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

  it("sert le PDF et le tableur depuis le lot R2", () => {
    for (const format of ["pdf", "csv"] as const) {
      expect(companyOrderSummaryRequestSchema.parse({ orderIds: ["o1"], format }).format).toBe(
        format,
      );
    }
  });

  it("refuse un format qu'aucun lot ne sert", () => {
    expect(
      companyOrderSummaryRequestSchema.safeParse({ orderIds: ["o1"], format: "xlsx" }).success,
    ).toBe(false);
  });

  it("accepte une période facultative, bornes AAAA-MM-JJ chacune facultative (R3)", () => {
    expect(
      companyOrderSummaryRequestSchema.parse({
        orderIds: ["o1"],
        format: "pdf",
        period: { from: "2026-10-01" },
      }).period,
    ).toEqual({ from: "2026-10-01" });
    expect(
      companyOrderSummaryRequestSchema.safeParse({
        orderIds: ["o1"],
        period: { from: "01/10/2026" },
      }).success,
    ).toBe(false);
  });
});
