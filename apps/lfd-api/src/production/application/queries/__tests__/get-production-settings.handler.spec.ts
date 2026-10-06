import { addDays } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ProductionCloseSettings } from "../../../domain/entities/production-close-settings.js";
import { todayOf } from "../../../domain/services/relative-day.js";
import {
  ClosedDaysTable,
  CutoffRules,
  SettingsReader,
  SettingsTable,
} from "../../__tests__/settings-doubles.js";
import { GetProductionSettingsHandler } from "../get-production-settings.handler.js";

const NOW = new Date();
const TODAY = todayOf(NOW);

function subject() {
  const settings = new SettingsTable();
  const closedDays = new ClosedDaysTable();
  const cutoffs = new CutoffRules();
  const handler = new GetProductionSettingsHandler(
    new SettingsReader(settings, closedDays),
    cutoffs,
    new FixedClock(NOW),
  );
  return { settings, closedDays, cutoffs, handler };
}

describe("GetProductionSettingsHandler", () => {
  it("rend le réglage de départ quand personne n'a réglé, sans heure limite", async () => {
    const { handler } = subject();

    expect(await handler.execute()).toEqual({
      close: { mode: "manual", closeAt: null, alertAt: "20:00" },
      latestOrderCutoff: null,
      closedDays: [],
    });
  });

  it("rend le réglage posé, l'heure limite la plus tardive, et les jours fermés à venir", async () => {
    const { handler, settings, closedDays, cutoffs } = subject();
    const posed = ProductionCloseSettings.initial();
    posed.change({ mode: "auto", closeAt: "21:00", alertAt: null }, null, "s-1", NOW);
    settings.row = posed;
    cutoffs.current = [
      { daysBefore: 1, time: "18:00", graceMinutes: 0 },
      { daysBefore: 1, time: "19:00", graceMinutes: 15 },
    ];
    closedDays.days.set(addDays(TODAY, -1), "s-1");
    closedDays.days.set(addDays(TODAY, 5), "s-1");
    closedDays.days.set(TODAY, "s-1");

    expect(await handler.execute()).toEqual({
      close: { mode: "auto", closeAt: "21:00", alertAt: null },
      latestOrderCutoff: { daysBefore: 1, time: "19:15" },
      closedDays: [TODAY, addDays(TODAY, 5)],
    });
  });
});
