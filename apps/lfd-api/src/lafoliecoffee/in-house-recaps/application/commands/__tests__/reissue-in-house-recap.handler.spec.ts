import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InHouseRecap } from "../../../domain/entities/in-house-recap.js";
import {
  EmptyInHouseRecapError,
  InHouseRecapAlreadyReplacedError,
  InHouseRecapNotFoundError,
} from "../../../domain/errors/in-house-recap-errors.js";
import type { RecapSourceNote } from "../../../domain/services/recap-aggregation.js";
import { RecapMonth } from "../../../domain/value-objects/recap-month.js";
import {
  CountingNumbering,
  InMemoryInHouseRecaps,
  RecordingRecapDocument,
  StubRecapNotes,
} from "../../__tests__/in-house-recap-doubles.js";
import { ReissueInHouseRecapCommand } from "../reissue-in-house-recap.command.js";
import { ReissueInHouseRecapHandler } from "../reissue-in-house-recap.handler.js";

const OCTOBER = RecapMonth.fromKey("2026-10");
const IN_OCTOBER = new Date("2026-10-12T09:00:00.000Z");
const NOW = new Date("2026-11-20T10:00:00.000Z");

function note(id: string, quantity: number, version: number): RecapSourceNote {
  return {
    deliveryNoteId: id,
    number: `BL-${id}`,
    handedOverAt: IN_OCTOBER,
    contentVersion: version,
    lines: [{ sku: "CROI", productName: "Croissant", saleUnit: "piece", quantity }],
  };
}

async function scene() {
  const recaps = new InMemoryInHouseRecaps();
  const notes = new StubRecapNotes(recaps);
  const document = new RecordingRecapDocument();
  await recaps.save(
    InHouseRecap.issue({
      id: "old",
      payerId: "resto",
      month: OCTOBER,
      number: "RBL-202610-0001",
      issuedAt: IN_OCTOBER,
      notes: [note("a", 3, 1)],
    }),
  );
  const handler = new ReissueInHouseRecapHandler(
    recaps,
    notes,
    new CountingNumbering(),
    document,
    inMemoryIntents(),
    new FixedIdGenerator("r"),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
  const reissue = (recapId = "old", key = "intent-1") =>
    handler.execute(new ReissueInHouseRecapCommand(recapId, "staff-1", key));
  return { recaps, notes, document, reissue };
}

describe("ReissueInHouseRecapHandler — le rectificatif (D8)", () => {
  it("relit le BL révisé, remplace l'ancien et annonce le rectificatif", async () => {
    const { recaps, notes, document, reissue } = await scene();
    notes.notes.set("resto", [note("a", 5, 2)]);

    const id = await reissue();

    const rectified = recaps.byId.get(id);
    expect(rectified?.toState()).toMatchObject({ payerId: "resto", replacedById: null });
    expect(rectified?.toState().notes[0]?.contentVersion).toBe(2);
    expect(rectified?.toState().lines[0]?.quantity).toBe(5);
    expect(recaps.byId.get("old")?.toState()).toMatchObject({ replacedById: id, replacedAt: NOW });
    expect(recaps.writes.at(-1)).toBe(`rectify:old->${id}`);
    expect(document.announced).toEqual([id]);
  });

  it("rejoué sous la même intention, rend le même rectificatif sans rien réécrire ni réannoncer", async () => {
    const { recaps, notes, document, reissue } = await scene();
    notes.notes.set("resto", [note("a", 5, 2)]);
    const first = await reissue();

    expect(await reissue()).toBe(first);
    expect(recaps.writes.filter((write) => write.startsWith("rectify"))).toHaveLength(1);
    expect(document.announced).toEqual([first]);
  });

  it("refuse un récapitulatif inconnu, ou déjà remplacé", async () => {
    const { notes, reissue } = await scene();
    notes.notes.set("resto", [note("a", 5, 2)]);
    await expect(reissue("absent")).rejects.toBeInstanceOf(InHouseRecapNotFoundError);
    await reissue();
    await expect(reissue("old", "intent-2")).rejects.toBeInstanceOf(
      InHouseRecapAlreadyReplacedError,
    );
  });

  it("refuse quand plus aucun BL n'est remis dans le mois ; l'ancien reste en place", async () => {
    const { recaps, document, reissue } = await scene();

    await expect(reissue()).rejects.toBeInstanceOf(EmptyInHouseRecapError);
    expect(recaps.byId.get("old")?.isReplaced).toBe(false);
    expect(document.announced).toEqual([]);
  });
});
