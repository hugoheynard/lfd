import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ResupplySiteUnknownError } from "../../domain/resupply-site-errors.js";
import { GetCounterSettingsHandler } from "../get-counter-settings.handler.js";
import { SetCounterSettingsCommand } from "../set-counter-settings.command.js";
import { SetCounterSettingsHandler } from "../set-counter-settings.handler.js";
import {
  FixedCounterSites,
  InMemoryCounterStockSettings,
  InMemoryCounterStockSettingsReader,
} from "./counter-settings-doubles.js";
import { Directory, Sites } from "./resupply-doubles.js";

/** L'instant n'est que gelé : aucun réglage ne se compare à l'horloge. */
const NOW = new Date("2026-01-02T08:00:00Z");
const VILLAGE = "site_village";
const LABO = "site_labo";

function setup() {
  const settings = new InMemoryCounterStockSettings();
  return {
    settings,
    set: new SetCounterSettingsHandler(
      new Sites([VILLAGE, LABO]),
      settings,
      new Directory({ name: "Lou Martin", role: "admin" }),
      new FixedClock(NOW),
    ),
    get: new GetCounterSettingsHandler(
      new FixedCounterSites([
        { id: LABO, label: "Le Labo" },
        { id: VILLAGE, label: "Val Village" },
      ]),
      new InMemoryCounterStockSettingsReader(settings),
    ),
  };
}

describe("Réglages › Comptoir", () => {
  it("un point jamais réglé ne suit pas son stock, sans auteur", async () => {
    const { get } = setup();

    await expect(get.execute()).resolves.toEqual({
      sites: [
        {
          siteId: LABO,
          siteLabel: "Le Labo",
          stockTracking: false,
          immediateWithoutStock: false,
          updatedAt: null,
          updatedBy: null,
        },
        {
          siteId: VILLAGE,
          siteLabel: "Val Village",
          stockTracking: false,
          immediateWithoutStock: false,
          updatedAt: null,
          updatedBy: null,
        },
      ],
    });
  });

  it("activer pose le réglage du seul point visé, auteur et instant compris", async () => {
    const { get, set } = setup();

    await set.execute(new SetCounterSettingsCommand(VILLAGE, true, false, "staff_lou"));

    const { sites } = await get.execute();
    expect(sites).toEqual([
      expect.objectContaining({ siteId: LABO, stockTracking: false, updatedBy: null }),
      expect.objectContaining({
        siteId: VILLAGE,
        stockTracking: true,
        updatedAt: NOW.toISOString(),
        updatedBy: "Lou Martin",
      }),
    ]);
  });

  it("désactiver après avoir activé réécrit la même ligne", async () => {
    const { set, settings } = setup();

    await set.execute(new SetCounterSettingsCommand(VILLAGE, true, false, "staff_lou"));
    await set.execute(new SetCounterSettingsCommand(VILLAGE, false, false, "staff_lou"));

    expect([...settings.rows.values()]).toEqual([
      expect.objectContaining({ siteId: VILLAGE, stockTracking: false }),
    ]);
  });

  it("le retrait immédiat sans stock se pose avec le suivi, chacun pour lui", async () => {
    const { get, set } = setup();

    await set.execute(new SetCounterSettingsCommand(VILLAGE, false, true, "staff_lou"));

    const { sites } = await get.execute();
    expect(sites).toEqual([
      expect.objectContaining({ siteId: LABO, immediateWithoutStock: false }),
      expect.objectContaining({
        siteId: VILLAGE,
        stockTracking: false,
        immediateWithoutStock: true,
      }),
    ]);
  });

  it("refuse un point inconnu ou archivé, sans rien écrire", async () => {
    const { set, settings } = setup();

    await expect(
      set.execute(new SetCounterSettingsCommand("site_inconnu", true, false, "staff_lou")),
    ).rejects.toThrow(ResupplySiteUnknownError);
    expect(settings.rows.size).toBe(0);
  });
});
