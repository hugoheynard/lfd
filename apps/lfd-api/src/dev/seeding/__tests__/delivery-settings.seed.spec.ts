import {
  demoRoutingSettings,
  type RoutingSettingsRow,
  routingSettingsToPose,
} from "../delivery-settings.seed.js";

const MANNE_ID = "bt_manne";
const WANTED = demoRoutingSettings(MANNE_ID);

/** Les réglages en place, déjà ceux de la démo. */
const SEEDED: RoutingSettingsRow = {
  earliestDeparture: "05:30",
  maxRoundMinutes: 240,
  stopMinutes: 6,
  defaultMode: "new_rounds",
  multiplePassages: false,
  safetyMarginMinutes: 15,
  defaultBinTypeId: MANNE_ID,
  defaultBinCount: 1,
};

describe("routingSettingsToPose", () => {
  it("pose les réglages de la démo quand personne n'a rien réglé", () => {
    expect(routingSettingsToPose(null, WANTED)).toEqual(WANTED);
  });

  it("n'écrit rien quand les réglages sont déjà ceux de la démo (pas de fait au journal)", () => {
    expect(routingSettingsToPose(SEEDED, WANTED)).toBeNull();
  });

  it("remet le second passage coupé, sans quoi deux camionnettes suffiraient", () => {
    expect(routingSettingsToPose({ ...SEEDED, multiplePassages: true }, WANTED)).toEqual(WANTED);
  });

  it("remet le contenant par défaut quand il a été vidé ou changé", () => {
    const emptied = { ...SEEDED, defaultBinTypeId: null, defaultBinCount: null };
    expect(routingSettingsToPose(emptied, WANTED)).toEqual(WANTED);
    expect(routingSettingsToPose({ ...SEEDED, defaultBinCount: 2 }, WANTED)).toEqual(WANTED);
  });
});

describe("demoRoutingSettings", () => {
  it("compte une manne par commande et coupe le second passage", () => {
    expect(WANTED.defaultContainer).toEqual({ binTypeId: MANNE_ID, count: 1 });
    expect(WANTED.multiplePassages).toBe(false);
  });
});
