import {
  dossierUpdateSummaryDataOf,
  type PlanVersionSummary,
} from "../dossier-update-mail-data.js";

const MARK = {
  version: 2,
  cause: "retaken" as const,
  recordedAt: new Date("2026-11-27T18:10:00.000Z"),
  recordedBy: { kind: "system" as const },
  closedAt: new Date("2026-11-27T17:00:00.000Z"),
};
const SHIPMENT = { orderId: "o1", rank: 2, reference: "ORD-1", customerLabel: "Trois Ponts" };

/** Le résumé mis en données d'e-mail : sans date, les quantités dites (lot H6). */
describe("dossierUpdateSummaryDataOf", () => {
  const summary: PlanVersionSummary = {
    production: [
      { sku: "c", productName: "Croissant", saleUnit: "piece", before: 120, after: 135, delta: 15 },
      { sku: "p", productName: "Pain", saleUnit: "weight", before: 2000, after: 1500, delta: -500 },
    ],
    changes: [
      {
        kind: "entered",
        shipment: SHIPMENT,
        by: MARK,
        entry: "retaken",
        offPlan: true,
        reason: "retaken_off_plan",
      },
      {
        kind: "revised",
        shipment: SHIPMENT,
        by: MARK,
        lines: [{ sku: "p", productName: "Pain", saleUnit: "weight", before: 500, after: 1250 }],
      },
      { kind: "withdrawn", shipment: SHIPMENT, by: MARK, withdrawnAt: "x", withdrawnBy: null },
    ],
    otherChanges: 3,
    resupplies: [{ kind: "launched", resupplyId: "r1", siteLabel: null, name: "Soir", by: MARK }],
    toCheck: [
      { kind: "left_reason_at_commerce", severity: "to_check", shipment: SHIPMENT, by: MARK },
    ],
  };

  it("dit les quantités dans leur unité, l'écart signé, l'heure du geste à Paris", () => {
    expect(dossierUpdateSummaryDataOf(summary)).toEqual({
      production: [
        { productName: "Croissant", before: "120", after: "135", delta: "+15" },
        { productName: "Pain", before: "2 kg", after: "1,5 kg", delta: "−500 g" },
      ],
      changes: [
        {
          kind: "entered",
          shipment: { reference: "ORD-1", rank: 2 },
          reason: "retaken_off_plan",
          atLabel: "19 h 10",
        },
        {
          kind: "revised",
          shipment: { reference: "ORD-1", rank: 2 },
          lines: [{ productName: "Pain", before: "500 g", after: "1,25 kg" }],
        },
        { kind: "withdrawn", shipment: { reference: "ORD-1", rank: 2 } },
      ],
      otherChanges: 3,
      resupplies: [{ kind: "launched", siteLabel: null, name: "Soir" }],
      toCheck: [{ reference: "ORD-1", rank: 2 }],
    });
  });

  it("ne porte aucune date : la demande traverse la boîte d'envoi", () => {
    expect(JSON.stringify(dossierUpdateSummaryDataOf(summary))).not.toMatch(/\d{4}-\d{2}-\d{2}T/u);
  });
});
