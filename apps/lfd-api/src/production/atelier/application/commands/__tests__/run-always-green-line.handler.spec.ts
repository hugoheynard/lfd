import { localToInstant } from "@lfd/contracts";

import { alwaysGreenScene, BAGUETTE, SCENE_MARGIN } from "../../__tests__/always-green-scene.js";
import { nextIntent, SCENE_DAY, SCENE_SKU } from "../../__tests__/problem-scene.js";
import { RecordBatchCommand } from "../record-batch.command.js";
import { ReportProblemCommand } from "../report-problem.command.js";
import { RunAlwaysGreenLineCommand } from "../run-always-green-line.command.js";

/** La fournée automatique d'une ligne (plan `fournil/plan-niveaux-de-suivi.md`, § 3.7), ports doublés. */
function at(time: string): Date {
  const instant = localToInstant(SCENE_DAY, time);
  if (instant === null) {
    throw new RangeError(time);
  }
  return instant;
}

const croissant = new RunAlwaysGreenLineCommand(SCENE_DAY, SCENE_SKU);

describe("RunAlwaysGreenLineHandler", () => {
  it("prend le verrou, PUIS relit la journée et déclare le palier échu, remis au colisage", async () => {
    const scene = alwaysGreenScene();
    scene.clock.set(at("07:15"));

    expect(await scene.line.execute(croissant)).toBe("recorded");

    expect(scene.trace.indexOf(`lock:${SCENE_DAY}`)).toBeLessThan(scene.trace.indexOf("load"));
    const batch = scene.store.batches[0];
    expect(batch).toMatchObject({
      id: `auto-${SCENE_DAY}-${SCENE_SKU}-0`,
      quantity: 10,
      recorded: { by: "system:always-green" },
    });
    expect(scene.ledger.handoffs.map((handoff) => handoff.id)).toContain(batch?.id);
  });

  it("avant l'heure plus la marge, rien", async () => {
    const scene = alwaysGreenScene();
    scene.clock.set(new Date(at("07:00").getTime() + (SCENE_MARGIN - 1) * 60_000));

    expect(await scene.line.execute(croissant)).toBe("nothing");
    expect(scene.store.batches).toEqual([]);
  });

  it("une fournée humaine arrivée avant le verrou est vue : seul le manque est déclaré", async () => {
    const scene = alwaysGreenScene();
    await scene.record.execute(new RecordBatchCommand(SCENE_DAY, SCENE_SKU, "h1", 7, "", "s"));
    scene.clock.set(at("07:15"));

    await scene.line.execute(croissant);

    expect(scene.store.batches.at(-1)).toMatchObject({
      id: `auto-${SCENE_DAY}-${SCENE_SKU}-1`,
      quantity: 3,
    });
  });

  it("un rouge arrivé avant le verrou borne la cible", async () => {
    const scene = alwaysGreenScene();
    await scene.report.execute(
      new ReportProblemCommand(SCENE_DAY, SCENE_SKU, 4, null, "staff-1", nextIntent()),
    );
    scene.clock.set(at("10:00"));

    await scene.line.execute(croissant);

    expect((await scene.days.load()).producedOf(SCENE_SKU)).toBe(4);
  });

  it("rejoué sur le même état, n'écrit rien de plus", async () => {
    const scene = alwaysGreenScene();
    scene.clock.set(at("07:15"));

    await scene.line.execute(croissant);
    const writes = scene.store.writes.length;
    expect(await scene.line.execute(croissant)).toBe("nothing");

    expect(scene.store.writes).toHaveLength(writes);
    expect(scene.store.batches).toHaveLength(1);
  });

  it("deux passages calculés sur le même état rejouent la même charge, sous le même id", async () => {
    const scene = alwaysGreenScene();
    scene.clock.set(at("07:15"));
    scene.days.stale = true;

    await scene.line.execute(croissant);
    await scene.line.execute(croissant);

    expect(scene.store.writes).toEqual([`auto-${SCENE_DAY}-${SCENE_SKU}-0`]);
  });

  it("un état nouveau — le palier suivant échu — donne un nouvel id", async () => {
    const scene = alwaysGreenScene();
    scene.clock.set(at("07:15"));
    await scene.line.execute(croissant);
    scene.clock.set(at("09:15"));

    await scene.line.execute(croissant);

    expect(scene.store.batches.map((batch) => [batch.id, batch.quantity])).toEqual([
      [`auto-${SCENE_DAY}-${SCENE_SKU}-0`, 10],
      [`auto-${SCENE_DAY}-${SCENE_SKU}-1`, 6],
    ]);
  });

  it("une ligne sans palier, ou des besoins illisibles, n'est pas complétée", async () => {
    const scene = alwaysGreenScene();
    scene.clock.set(at("23:00"));
    expect(await scene.line.execute(new RunAlwaysGreenLineCommand(SCENE_DAY, BAGUETTE))).toBe(
      "no_deadline",
    );

    const down = alwaysGreenScene("down");
    down.clock.set(at("23:00"));
    expect(await down.line.execute(croissant)).toBe("no_deadline");
    expect([...scene.store.batches, ...down.store.batches]).toEqual([]);
  });
});
