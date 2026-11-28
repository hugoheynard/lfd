import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { GetResupplySwitchHandler } from "../get-resupply-switch.handler.js";
import { SetResupplySwitchCommand } from "../set-resupply-switch.command.js";
import { SetResupplySwitchHandler } from "../set-resupply-switch.handler.js";
import { Directory } from "./resupply-doubles.js";
import { InMemoryResupplySwitch, InMemoryResupplySwitchReader } from "./resupply-switch-doubles.js";

/** L'instant n'est que gelé : l'interrupteur ne se compare pas à l'horloge. */
const NOW = new Date("2026-01-02T08:00:00Z");

function setup() {
  const store = new InMemoryResupplySwitch();
  return {
    store,
    set: new SetResupplySwitchHandler(
      store,
      new Directory({ name: "Lou Martin", role: "admin" }),
      new FixedClock(NOW),
    ),
    get: new GetResupplySwitchHandler(new InMemoryResupplySwitchReader(store)),
  };
}

describe("l'interrupteur du réassort", () => {
  it("jamais posé, il est éteint et sans auteur", async () => {
    const { get } = setup();

    await expect(get.execute()).resolves.toEqual({
      enabled: false,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("allumé puis éteint, il se relit avec son auteur et son instant", async () => {
    const { get, set } = setup();

    await set.execute(new SetResupplySwitchCommand(true, "staff_lou"));
    await expect(get.execute()).resolves.toEqual({
      enabled: true,
      updatedAt: NOW.toISOString(),
      updatedBy: "Lou Martin",
    });

    await set.execute(new SetResupplySwitchCommand(false, "staff_lou"));
    await expect(get.execute()).resolves.toMatchObject({ enabled: false });
  });

  it("garde l'identifiant de qui l'a posé", async () => {
    const { set, store } = setup();

    await set.execute(new SetResupplySwitchCommand(true, "staff_lou"));

    expect(store.posed?.updated.author).toMatchObject({ staffUserId: "staff_lou", role: "admin" });
  });
});
