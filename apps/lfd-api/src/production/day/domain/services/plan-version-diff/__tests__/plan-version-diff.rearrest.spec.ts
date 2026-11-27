import { diffPlanVersions } from "../plan-version-diff.js";
import { MORNING, PlayedDay, order } from "./plan-version-diff.fixture.js";

/**
 * Le cas du 2026-11-27, rejoué sans la correction de la course : huit
 * commandes au premier arrêt, sept au nouvel arrêt après la réouverture —
 * la huitième n'avait pas été remise au commerce. Elle sort « raison au
 * commerce », à vérifier.
 */
describe("diffPlanVersions — le 2026-11-27", () => {
  it("la 8ᵉ commande apparaît en sortie à vérifier", () => {
    const eight = Array.from({ length: 8 }, (_, index) => order(`ord_${index + 1}`));
    const played = new PlayedDay().close(eight).reopen().close(eight.slice(0, 7), MORNING);

    const diff = diffPlanVersions(played.versions, 1, 2);

    expect(diff.changes).toEqual([]);
    expect(diff.toCheck).toMatchObject([
      {
        kind: "left_reason_at_commerce",
        severity: "to_check",
        shipment: {
          orderId: "ord_8",
          rank: 1,
          reference: "ORD-ord_8",
          customerLabel: "Trois Ponts",
        },
        by: { version: 2, cause: "closed" },
      },
    ]);
    expect(diff.production).toEqual([
      expect.objectContaining({ sku: "VIE-001", before: 320, after: 280, delta: -40 }),
    ]);
  });
});
