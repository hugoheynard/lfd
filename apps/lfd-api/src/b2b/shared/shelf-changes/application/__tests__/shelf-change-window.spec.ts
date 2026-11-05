import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ALL_SHELVES, companyShelves } from "../../domain/shelf-change-scope.js";
import { SHELF_PURGE_WINDOW_MS, ShelfChangeWindow } from "../shelf-change-window.js";
import { ManualShelfWindowTimer, RecordingShelfPurge } from "./shelf-window-doubles.js";

/**
 * La fenêtre d'une seconde (`le-rayon-en-cache.md` § 5) : une ingestion
 * de 200 fiches ne doit pas déclencher 200 purges.
 */
const OPENED_AT = new Date(0);

function windowWith(): {
  readonly window: ShelfChangeWindow;
  readonly timer: ManualShelfWindowTimer;
  readonly purge: RecordingShelfPurge;
  readonly clock: FixedClock;
} {
  const timer = new ManualShelfWindowTimer();
  const purge = new RecordingShelfPurge();
  const clock = new FixedClock(OPENED_AT);
  return { window: new ShelfChangeWindow(clock, timer, purge), timer, purge, clock };
}

describe("ShelfChangeWindow — au plus une purge par seconde", () => {
  it("une rafale de 200 changements donne UNE purge, à la fin de la fenêtre", async () => {
    const { window, timer, purge } = windowWith();
    for (let index = 0; index < 200; index += 1) {
      window.record(companyShelves(`co_${index % 3}`));
    }
    expect(purge.requests).toEqual([]);
    expect(timer.delays).toEqual([SHELF_PURGE_WINDOW_MS]);

    await timer.fire();

    expect(purge.requests).toEqual([
      {
        order: { kind: "companies", companyIds: ["co_0", "co_1", "co_2"] },
        windowOpenedAt: OPENED_AT,
      },
    ]);
  });

  it("un « tout » dans la fenêtre absorbe les sociétés", async () => {
    const { window, timer, purge } = windowWith();
    window.record(companyShelves("co_a"));
    window.record(ALL_SHELVES);
    window.record(companyShelves("co_b"));
    await timer.fire();
    expect(purge.requests.map((request) => request.order)).toEqual([{ kind: "all" }]);
  });

  it("la fenêtre close, le changement suivant en ouvre une autre, à son propre instant", async () => {
    const { window, timer, purge, clock } = windowWith();
    window.record(companyShelves("co_a"));
    await timer.fire();
    clock.advanceMs(SHELF_PURGE_WINDOW_MS * 5);
    window.record(companyShelves("co_b"));
    await timer.fire();

    expect(timer.delays).toHaveLength(2);
    expect(purge.requests).toEqual([
      { order: { kind: "companies", companyIds: ["co_a"] }, windowOpenedAt: OPENED_AT },
      {
        order: { kind: "companies", companyIds: ["co_b"] },
        windowOpenedAt: new Date(OPENED_AT.getTime() + SHELF_PURGE_WINDOW_MS * 5),
      },
    ]);
  });

  it("une purge qui échoue n'est pas rejouée, et n'empêche pas la fenêtre suivante", async () => {
    const { window, timer, purge } = windowWith();
    purge.failing = true;
    window.record(ALL_SHELVES);
    await timer.fire();
    purge.failing = false;
    window.record(companyShelves("co_a"));
    await timer.fire();
    expect(purge.requests.map((request) => request.order)).toEqual([
      { kind: "companies", companyIds: ["co_a"] },
    ]);
  });
});
