import { addDays } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PastClosedDayError } from "../../../domain/errors/production-settings-errors.js";
import { todayOf } from "../../../domain/services/relative-day.js";
import { ClosedDaysTable } from "../../__tests__/settings-doubles.js";
import { AddProductionClosedDayCommand } from "../add-production-closed-day.command.js";
import { AddProductionClosedDayHandler } from "../add-production-closed-day.handler.js";
import { RemoveProductionClosedDayCommand } from "../remove-production-closed-day.command.js";
import { RemoveProductionClosedDayHandler } from "../remove-production-closed-day.handler.js";

const NOW = new Date();
const TODAY = todayOf(NOW);

function subject() {
  const closedDays = new ClosedDaysTable();
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  return {
    closedDays,
    events,
    add: new AddProductionClosedDayHandler(closedDays, events, clock, uow),
    remove: new RemoveProductionClosedDayHandler(closedDays, events, uow),
  };
}

describe("AddProductionClosedDayHandler", () => {
  it("ferme un jour à venir et le journalise sous sa date", async () => {
    const { add, closedDays, events } = subject();
    const day = addDays(TODAY, 3);

    await add.execute(new AddProductionClosedDayCommand(day, "s-1"));

    expect(closedDays.days.get(day)).toBe("s-1");
    expect(events.factTypes()).toEqual(["production_closed_day.added"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectId: day,
      payload: { subjectLabel: day, serviceDay: day },
    });
  });

  it("un jour déjà fermé ne journalise pas deux fois", async () => {
    const { add, events } = subject();
    const day = addDays(TODAY, 3);

    await add.execute(new AddProductionClosedDayCommand(day, "s-1"));
    await add.execute(new AddProductionClosedDayCommand(day, "s-2"));

    expect(events.factTypes()).toEqual(["production_closed_day.added"]);
  });

  it("refuse une date passée, sans rien écrire", async () => {
    const { add, closedDays } = subject();

    await expect(
      add.execute(new AddProductionClosedDayCommand(addDays(TODAY, -1), "s-1")),
    ).rejects.toThrow(PastClosedDayError);
    expect(closedDays.days.size).toBe(0);
  });
});

describe("RemoveProductionClosedDayHandler", () => {
  it("rouvre un jour fermé et le journalise ; silencieux sur un jour ouvert", async () => {
    const { add, remove, closedDays, events } = subject();
    const day = addDays(TODAY, 3);
    await add.execute(new AddProductionClosedDayCommand(day, "s-1"));

    await remove.execute(new RemoveProductionClosedDayCommand(day, "s-1"));
    await remove.execute(new RemoveProductionClosedDayCommand(day, "s-1"));

    expect(closedDays.days.size).toBe(0);
    expect(events.factTypes()).toEqual([
      "production_closed_day.added",
      "production_closed_day.removed",
    ]);
  });
});
