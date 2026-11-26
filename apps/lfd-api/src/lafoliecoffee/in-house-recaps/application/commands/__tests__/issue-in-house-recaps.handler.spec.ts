import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { RecapSourceNote } from "../../../domain/services/recap-aggregation.js";
import { RecapMonth } from "../../../domain/value-objects/recap-month.js";
import {
  CountingNumbering,
  InMemoryInHouseRecaps,
  InMemoryRecapRuns,
  RecordingRecapDocument,
  StubMonthPayers,
  StubRecapNotes,
} from "../../__tests__/in-house-recap-doubles.js";
import { IssueInHouseRecapsHandler } from "../issue-in-house-recaps.handler.js";

// L'horloge du test est fixe : ces instants ne sont comparés qu'à elle.
const NOW = new Date("2026-11-01T00:30:00.000Z");
const LAST_MONTH = RecapMonth.lastClosedAt(NOW);
const IN_LAST_MONTH = new Date(LAST_MONTH.window().from.getTime() + 5 * 86_400_000);
const THIS_MONTH = new Date(LAST_MONTH.window().to.getTime() + 3600_000);

function note(id: string, at: Date, quantity = 2): RecapSourceNote {
  return {
    deliveryNoteId: id,
    number: `BL-${id}`,
    handedOverAt: at,
    contentVersion: 1,
    lines: [{ sku: "CROI", productName: "Croissant", saleUnit: "piece", quantity }],
  };
}

function scene() {
  const recaps = new InMemoryInHouseRecaps();
  const notes = new StubRecapNotes(recaps);
  const payers = new StubMonthPayers();
  const runs = new InMemoryRecapRuns();
  const document = new RecordingRecapDocument();
  const handler = new IssueInHouseRecapsHandler(
    payers,
    notes,
    runs,
    recaps,
    new CountingNumbering(),
    document,
    new FixedIdGenerator("r"),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
  const run = () => handler.execute();
  return { recaps, notes, payers, runs, document, run };
}

describe("IssueInHouseRecapsHandler — le passage mensuel", () => {
  it("émet le récapitulatif du dernier mois clos ; le reliquat remis ce mois-ci n'y entre pas", async () => {
    const { notes, payers, recaps, document, run } = scene();
    payers.payers = ["resto"];
    notes.notes.set("resto", [note("a", IN_LAST_MONTH, 3), note("b", THIS_MONTH, 5)]);

    const report = await run();

    expect(report.month).toBe(LAST_MONTH.key);
    expect(report.outcomes).toEqual([{ payerId: "resto", kind: "issued", recapId: "r_000001" }]);
    const [recap] = [...recaps.byId.values()];
    expect(recap?.toState().notes.map((one) => one.deliveryNoteId)).toEqual(["a"]);
    expect(recap?.toState().lines[0]?.quantity).toBe(3);
    expect(document.announced).toEqual([recap?.id]);
  });

  it("un payeur maison sans BL reçoit une issue vide, sans document", async () => {
    const { payers, runs, recaps, document, run } = scene();
    payers.payers = ["resto"];

    const report = await run();

    expect(report.outcomes).toEqual([{ payerId: "resto", kind: "empty" }]);
    expect(runs.runs.get(`resto|${LAST_MONTH.key}`)?.recapId).toBeNull();
    expect(recaps.byId.size).toBe(0);
    expect(document.announced).toEqual([]);
  });

  it("le payeur d'un BL interne entre au passage même démarqué depuis", async () => {
    const { notes, run } = scene();
    notes.notes.set("ancien", [note("a", IN_LAST_MONTH)]);

    expect((await run()).outcomes).toEqual([
      { payerId: "ancien", kind: "issued", recapId: "r_000001" },
    ]);
  });

  it("rejoué, il se tait : rien de réémis, rien de réannoncé", async () => {
    const { notes, payers, recaps, document, run } = scene();
    payers.payers = ["resto", "vide"];
    notes.notes.set("resto", [note("a", IN_LAST_MONTH)]);
    await run();

    const again = await run();

    expect(again.outcomes).toEqual([
      { payerId: "resto", kind: "already_attempted" },
      { payerId: "vide", kind: "already_attempted" },
    ]);
    expect(recaps.writes).toHaveLength(1);
    expect(document.announced).toHaveLength(1);
  });

  it("des BL à quantité nulle font un mois vide, pas un récapitulatif refusé", async () => {
    const { notes, payers, run } = scene();
    payers.payers = ["resto"];
    notes.notes.set("resto", [note("a", IN_LAST_MONTH, 0)]);

    expect((await run()).outcomes).toEqual([{ payerId: "resto", kind: "empty" }]);
  });

  it("un payeur en échec n'arrête pas les autres, et son mois reste sans issue", async () => {
    const { notes, payers, runs, run } = scene();
    payers.payers = ["a-casse", "b-sain"];
    notes.notes.set("a-casse", [note("x", IN_LAST_MONTH, -1)]);
    notes.notes.set("b-sain", [note("y", IN_LAST_MONTH)]);

    const report = await run();

    expect(report.outcomes).toEqual([
      { payerId: "a-casse", kind: "failed", code: "in_house_recap.quantity_invalid" },
      { payerId: "b-sain", kind: "issued", recapId: "r_000001" },
    ]);
    expect(runs.runs.has(`a-casse|${LAST_MONTH.key}`)).toBe(false);
    expect(runs.runs.has(`b-sain|${LAST_MONTH.key}`)).toBe(true);
  });
});
