import { addDays } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { todayOf } from "../../../domain/services/relative-day.js";
import { ClosedDaysTable, CutoffRules, SettingsReader } from "../../__tests__/settings-doubles.js";
import { GetProductionSettingsHandler } from "../get-production-settings.handler.js";

const NOW = new Date();
const TODAY = todayOf(NOW);

function subject() {
  const closedDays = new ClosedDaysTable();
  const cutoffs = new CutoffRules();
  const handler = new GetProductionSettingsHandler(
    new SettingsReader(closedDays),
    cutoffs,
    new FixedClock(NOW),
  );
  return { closedDays, cutoffs, handler };
}

describe("GetProductionSettingsHandler", () => {
  it("sans heure limite générale, rien n'arrête le plan tout seul", async () => {
    const { handler } = subject();

    expect(await handler.execute()).toEqual({ automaticClose: null, closedDays: [] });
  });

  /**
   * 2026-10-21 (`plan-une-seule-heure.md` §5) : l'arrêt automatique n'est plus
   * un réglage du fournil — il est lu de l'heure limite générale, rattrapage
   * compris, et servi en lecture.
   */
  it("rend l'arrêt automatique tel que l'heure limite le fixe, et les jours fermés à venir", async () => {
    const { handler, closedDays, cutoffs } = subject();
    cutoffs.current = [{ daysBefore: 1, time: "23:00", graceMinutes: 15 }];
    closedDays.days.set(addDays(TODAY, -1), "s-1");
    closedDays.days.set(addDays(TODAY, 5), "s-1");
    closedDays.days.set(TODAY, "s-1");

    expect(await handler.execute()).toEqual({
      automaticClose: { daysBefore: 1, time: "23:15" },
      closedDays: [TODAY, addDays(TODAY, 5)],
    });
  });

  it("un rattrapage qui passe minuit arrête le plan le jour même", async () => {
    const { handler, cutoffs } = subject();
    cutoffs.current = [{ daysBefore: 1, time: "23:00", graceMinutes: 90 }];

    expect((await handler.execute()).automaticClose).toEqual({ daysBefore: 0, time: "00:30" });
  });
});
