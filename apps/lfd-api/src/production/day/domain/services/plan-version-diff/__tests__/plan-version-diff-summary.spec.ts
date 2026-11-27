import { summarizePlanVersionDiff } from "../plan-version-diff-summary.js";
import { diffPlanVersions } from "../plan-version-diff.js";
import { MORNING, PlayedDay, order, orderLine } from "./plan-version-diff.fixture.js";

/** Le résumé de l'e-mail « dossier mis à jour » (lot H6), sur le même diff que l'écran. */

function busyDay(): PlayedDay {
  const many = Array.from({ length: 5 }, (_, index) => order(`ord_${index + 2}`));
  return new PlayedDay()
    .close([order("ord_1"), order("ord_9", { lines: [orderLine("BAG", 3)] })])
    .retake(many)
    .reopen()
    .close([order("ord_1"), ...many], MORNING);
}

describe("summarizePlanVersionDiff", () => {
  it("la production entière, les changements plafonnés avec leur reste, les sorties à vérifier entières", () => {
    const diff = diffPlanVersions(busyDay().versions, 1, 3);

    const summary = summarizePlanVersionDiff(diff, 2);

    expect(summary.production).toEqual(diff.production);
    expect(summary.changes).toEqual(diff.changes.slice(0, 2));
    expect(summary.otherChanges).toBe(3);
    expect(summary.toCheck).toMatchObject([{ shipment: { orderId: "ord_9" } }]);
  });

  it("sous le plafond : tout, et aucun reste", () => {
    const diff = diffPlanVersions(busyDay().versions, 1, 2);

    const summary = summarizePlanVersionDiff(diff);

    expect(summary.changes).toHaveLength(5);
    expect(summary.otherChanges).toBe(0);
  });

  it("un plafond négatif ne montre rien et compte tout", () => {
    const diff = diffPlanVersions(busyDay().versions, 1, 2);

    expect(summarizePlanVersionDiff(diff, -1)).toMatchObject({ changes: [], otherChanges: 5 });
  });
});
