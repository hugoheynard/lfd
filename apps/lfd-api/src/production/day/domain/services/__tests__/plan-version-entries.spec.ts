import {
  NIGHT,
  PlayedDay,
  order,
  orderLine,
} from "../plan-version-diff/__tests__/plan-version-diff.fixture.js";
import { planVersionEntriesOf } from "../plan-version-entries.js";

/**
 * La liste des versions (`plan-historique-des-tirages.md`, § 1.12 et § 1.14) :
 * chaque version, son tirage, ses envois, et le papier qui la représente.
 */
describe("planVersionEntriesOf", () => {
  it("rend une liste vide pour une journée jamais versionnée", () => {
    expect(planVersionEntriesOf([])).toEqual([]);
  });

  it("dit pour chaque version sa cause, son auteur, son tirage et son nombre d'envois", () => {
    const played = new PlayedDay()
      .close([order("o1", { lines: [orderLine("croissant", 10)] })])
      .retake([order("o2", { lines: [orderLine("pain", 2)] })], NIGHT);

    const entries = planVersionEntriesOf(played.versions);

    expect(entries.map((entry) => [entry.version, entry.cause, entry.printRun])).toEqual([
      [1, "closed", 1],
      [2, "retaken", 2],
    ]);
    expect(entries.map((entry) => entry.shipmentCount)).toEqual([1, 2]);
    expect(entries[0]?.recordedBy).toEqual({
      kind: "staff",
      staffId: "staff-1",
      name: "Marie Dupont",
    });
  });

  it("chaque version a son propre papier, sauf un retrait qui renvoie au papier d'avant", () => {
    const played = new PlayedDay()
      .close([order("o1"), order("o2")])
      .withdraw("o1")
      .withdraw("o2")
      .retake([order("o1"), order("o2"), order("o3")]);

    const entries = planVersionEntriesOf(played.versions);

    expect(entries.map((entry) => [entry.cause, entry.version, entry.paperVersion])).toEqual([
      ["closed", 1, 1],
      ["order_withdrawn", 2, 1],
      ["order_withdrawn", 3, 1],
      ["retaken", 4, 4],
    ]);
    expect(entries[1]?.recordedBy).toEqual({ kind: "customer" });
  });
});
