import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ALL_SHELVES, companyShelves } from "../../domain/shelf-change-scope.js";
import { DeferredShelfChanges } from "../deferred-shelf-changes.js";
import { ShelfChangeWindow } from "../shelf-change-window.js";
import { ManualShelfWindowTimer, RecordingShelfPurge } from "./shelf-window-doubles.js";

/**
 * « Après la validation » (`le-rayon-en-cache.md` § 5) : une purge montée
 * dans la transaction rouvrirait la course — un rayon recalculé sur l'état
 * d'avant, puis gardé. Le port diffère lui-même ; l'appelant ne peut l'oublier.
 */
function signal(): {
  readonly shelves: DeferredShelfChanges;
  readonly afterCommit: HeldAfterCommit;
  readonly timer: ManualShelfWindowTimer;
  readonly purge: RecordingShelfPurge;
} {
  const afterCommit = new HeldAfterCommit();
  const timer = new ManualShelfWindowTimer();
  const purge = new RecordingShelfPurge();
  const window = new ShelfChangeWindow(new FixedClock(new Date(0)), timer, purge);
  return { shelves: new DeferredShelfChanges(afterCommit, window), afterCommit, timer, purge };
}

describe("DeferredShelfChanges — le signal part après la validation", () => {
  it("rien n'entre dans la fenêtre avant la validation", async () => {
    const { shelves, timer, purge } = signal();
    shelves.changed(companyShelves("co_a"));
    await timer.fire();
    expect(timer.delays).toEqual([]);
    expect(purge.requests).toEqual([]);
  });

  it("une transaction qui échoue n'efface rien", async () => {
    const { shelves, afterCommit, timer, purge } = signal();
    shelves.changed(ALL_SHELVES);
    afterCommit.discard();
    await afterCommit.commit();
    await timer.fire();
    expect(purge.requests).toEqual([]);
  });

  it("validée, la portée entre dans la fenêtre et part à son terme", async () => {
    const { shelves, afterCommit, timer, purge } = signal();
    shelves.changed(companyShelves("co_a"));
    await afterCommit.commit();
    await timer.fire();
    expect(purge.requests.map((request) => request.order)).toEqual([
      { kind: "companies", companyIds: ["co_a"] },
    ]);
  });
});
