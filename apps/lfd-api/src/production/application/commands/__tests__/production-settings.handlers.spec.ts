import { addDays } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  CloseTimeBeforeOrderCutoffError,
  CloseTimeRequiredError,
  PastClosedDayError,
} from "../../../domain/errors/production-settings-errors.js";
import { todayOf } from "../../../domain/services/relative-day.js";
import { ClosedDaysTable, CutoffRules, SettingsTable } from "../../__tests__/settings-doubles.js";
import { AddProductionClosedDayCommand } from "../add-production-closed-day.command.js";
import { AddProductionClosedDayHandler } from "../add-production-closed-day.handler.js";
import { ChangeProductionCloseSettingsCommand } from "../change-production-close-settings.command.js";
import { ChangeProductionCloseSettingsHandler } from "../change-production-close-settings.handler.js";
import { RemoveProductionClosedDayCommand } from "../remove-production-closed-day.command.js";
import { RemoveProductionClosedDayHandler } from "../remove-production-closed-day.handler.js";

const NOW = new Date();
const TODAY = todayOf(NOW);

function subject() {
  const settings = new SettingsTable();
  const closedDays = new ClosedDaysTable();
  const cutoffs = new CutoffRules([{ daysBefore: 1, time: "18:00", graceMinutes: 30 }]);
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  return {
    settings,
    closedDays,
    cutoffs,
    events,
    change: new ChangeProductionCloseSettingsHandler(settings, cutoffs, events, clock, uow),
    add: new AddProductionClosedDayHandler(closedDays, events, clock, uow),
    remove: new RemoveProductionClosedDayHandler(closedDays, events, uow),
  };
}

describe("ChangeProductionCloseSettingsHandler", () => {
  it("part du réglage de départ, écrit l'agrégat et journalise l'avant et l'après", async () => {
    const { change, settings, events } = subject();

    await change.execute(new ChangeProductionCloseSettingsCommand("auto", "21:00", "20:00", "s-1"));

    expect(settings.row?.values).toEqual({ mode: "auto", closeAt: "21:00", alertAt: "20:00" });
    expect(settings.row?.updatedBy).toBe("s-1");
    expect(settings.row?.updatedAt).toBe(NOW);
    expect(events.factTypes()).toEqual(["production_settings.close_changed"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      before: { mode: "manual", closeAt: null, alertAt: "20:00" },
      after: { mode: "auto", closeAt: "21:00", alertAt: "20:00" },
    });
  });

  it("n'écrit ni ne journalise un réglage reposé à l'identique", async () => {
    const { change, settings, events } = subject();

    await change.execute(new ChangeProductionCloseSettingsCommand("manual", null, "20:00", "s-1"));

    expect(settings.saves).toBe(0);
    expect(events.factTypes()).toEqual([]);
  });

  it("juge l'heure d'arrêt contre l'heure limite du commerce, rattrapage compris (Q5)", async () => {
    const { change, settings, events } = subject();

    await expect(
      change.execute(new ChangeProductionCloseSettingsCommand("auto", "18:15", "20:00", "s-1")),
    ).rejects.toThrow(CloseTimeBeforeOrderCutoffError);
    expect(settings.saves).toBe(0);
    expect(events.factTypes()).toEqual([]);
  });

  it("sans heure limite au commerce, toute heure dans les bornes passe", async () => {
    const { change, cutoffs, settings } = subject();
    cutoffs.current = [];

    await change.execute(new ChangeProductionCloseSettingsCommand("auto", "12:00", null, "s-1"));

    expect(settings.row?.values.closeAt).toBe("12:00");
  });

  it("refuse l'automatique sans heure, sans rien écrire", async () => {
    const { change, settings } = subject();

    await expect(
      change.execute(new ChangeProductionCloseSettingsCommand("auto", null, "20:00", "s-1")),
    ).rejects.toThrow(CloseTimeRequiredError);
    expect(settings.saves).toBe(0);
  });
});

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
