import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PackingSettings } from "../../../domain/entities/packing-settings.js";
import { InMemoryPackingSettings } from "../../__tests__/packing-settings-doubles.js";
import { GetPackingSettingsHandler } from "../get-packing-settings.handler.js";
import { SetPackingSettingsCommand } from "../set-packing-settings.command.js";
import { SetPackingSettingsHandler } from "../set-packing-settings.handler.js";

const NOW = new Date(0);

function setup(posed: PackingSettings | null = null) {
  const store = new InMemoryPackingSettings(posed);
  return {
    store,
    get: new GetPackingSettingsHandler(store.reader()),
    set: new SetPackingSettingsHandler(
      store.reader(),
      store,
      new FixedClock(NOW),
      new DirectUnitOfWork(),
    ),
  };
}

describe("GetPackingSettingsHandler — les réglages tels qu'ils valent", () => {
  it("rend le partage fermé, par défaut, quand personne n'a rien posé", async () => {
    await expect(setup().get.execute()).resolves.toEqual({
      halfSharing: false,
      source: "default",
    });
  });

  it("rend le réglage posé", async () => {
    await expect(setup(PackingSettings.of({ halfSharing: true })).get.execute()).resolves.toEqual({
      halfSharing: true,
      source: "explicit",
    });
  });
});

describe("SetPackingSettingsHandler — poser les réglages du colisage", () => {
  it("ouvre le partage et fige l'auteur et l'instant", async () => {
    const { set, store } = setup();

    await set.execute(new SetPackingSettingsCommand(true, "staff_1"));

    expect(store.writes).toEqual([{ halfSharing: true, at: NOW, by: "staff_1" }]);
  });

  it("n'écrit rien quand le réglage est déjà en vigueur", async () => {
    const { set, store } = setup(PackingSettings.of({ halfSharing: true }));

    await set.execute(new SetPackingSettingsCommand(true, "staff_2"));

    expect(store.writes).toEqual([]);
  });

  it("pose explicitement « fermé » même quand c'était le défaut", async () => {
    const { set, store } = setup();

    await set.execute(new SetPackingSettingsCommand(false, "staff_1"));

    expect(store.writes).toEqual([{ halfSharing: false, at: NOW, by: "staff_1" }]);
  });
});
