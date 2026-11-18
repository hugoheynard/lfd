import { addDays } from "@lfd/contracts";

import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ProductionDisplaySettings } from "../../../../shared/print/index.js";
import { ProductionTrancheSettings } from "../../../../day/index.js";
import { todayOf } from "../../../../day/index.js";
import { ClosedDaysTable, SettingsReader, stopRulesOf } from "../../__tests__/settings-doubles.js";
import {
  CutoffRules,
  ResupplyTime,
} from "../../../../channels/commerce/__tests__/order-cutoff-doubles.js";
import { InMemoryTrancheSettings } from "../../../../day/application/__tests__/production-tranche-settings-doubles.js";
import { GetProductionSettingsHandler } from "../get-production-settings.handler.js";

const NOW = new Date();
const TODAY = todayOf(NOW);

function subject() {
  const closedDays = new ClosedDaysTable();
  const cutoffs = new CutoffRules();
  const resupplyTime = new ResupplyTime();
  const tranches = new InMemoryTrancheSettings();
  const display = new InMemoryDisplaySettings();
  const handler = new GetProductionSettingsHandler(
    new SettingsReader(closedDays),
    stopRulesOf(cutoffs, resupplyTime),
    new FixedClock(NOW),
    tranches.reader(),
    display.reader(),
  );
  return { closedDays, cutoffs, resupplyTime, tranches, display, handler };
}

describe("GetProductionSettingsHandler", () => {
  it("sans heure limite générale, rien n'arrête le plan tout seul", async () => {
    const { handler } = subject();

    expect(await handler.execute()).toEqual({
      automaticClose: null,
      closedDays: [],
      tranches: { mode: "computed", fixedTranches: [] },
      display: { showSubcategories: false, grouping: "shelf" },
    });
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
      tranches: { mode: "computed", fixedTranches: [] },
      display: { showSubcategories: false, grouping: "shelf" },
    });
  });

  it("rend le rangement du fournil posé — les sous-catégories affichées", async () => {
    const { handler, display } = subject();
    display.posed = ProductionDisplaySettings.of({ showSubcategories: true, grouping: "shelf" });

    expect((await handler.execute()).display).toEqual({
      showSubcategories: true,
      grouping: "shelf",
    });
  });

  it("un rattrapage qui passe minuit arrête le plan le jour même", async () => {
    const { handler, cutoffs } = subject();
    cutoffs.current = [{ daysBefore: 1, time: "23:00", graceMinutes: 90 }];

    expect((await handler.execute()).automaticClose).toEqual({ daysBefore: 0, time: "00:30" });
  });

  /** Lot R3a (2026-10-21) : l'arrêt suit la plus tardive des deux heures, et la page le dit. */
  it("rend l'heure du réassort quand elle est plus tardive que l'heure générale", async () => {
    const { handler, cutoffs, resupplyTime } = subject();
    cutoffs.current = [{ daysBefore: 1, time: "18:00", graceMinutes: 30 }];
    resupplyTime.current = "20:00";

    expect((await handler.execute()).automaticClose).toEqual({ daysBefore: 1, time: "20:00" });
  });

  it("garde l'heure générale, rattrapage compris, quand le réassort tombe avant", async () => {
    const { handler, cutoffs, resupplyTime } = subject();
    cutoffs.current = [{ daysBefore: 1, time: "21:00", graceMinutes: 30 }];
    resupplyTime.current = "20:00";

    expect((await handler.execute()).automaticClose).toEqual({ daysBefore: 1, time: "21:30" });
  });

  /** Plan des tranches, T1 : la page lit aussi les tranches posées. */
  it("rend les tranches posées", async () => {
    const { handler, tranches } = subject();
    tranches.posed = ProductionTrancheSettings.set("computed", ["07:00", "05:00"]);

    expect((await handler.execute()).tranches).toEqual({
      mode: "computed",
      fixedTranches: ["05:00", "07:00"],
    });
  });
});
