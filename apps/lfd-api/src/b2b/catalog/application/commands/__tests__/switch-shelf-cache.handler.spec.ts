import { ShelfCacheNotConfiguredError } from "../../../domain/errors/shelf-cache-not-configured.error.js";
import {
  ShopShelfSwitch,
  type ShelfCacheState,
  type ShelfSwitchAction,
} from "../../../domain/ports/shop-shelf-switch.js";
import { NoShopShelfSwitch } from "../../../infrastructure/no-shop-shelf-switch.js";
import { RecordingShelfSignals } from "../../__tests__/shelf-cache-doubles.js";
import { SwitchShelfCacheCommand } from "../switch-shelf-cache.command.js";
import { SwitchShelfCacheHandler } from "../switch-shelf-cache.handler.js";

/** Un interrupteur en mémoire, qui suit les règles de l'objet (éteindre et vider montent la version). */
class InMemoryShelfSwitch extends ShopShelfSwitch {
  readonly actions: ShelfSwitchAction[] = [];
  private state: ShelfCacheState = { enabled: true, version: 3 };

  apply(action: ShelfSwitchAction): Promise<ShelfCacheState> {
    this.actions.push(action);
    const bumped = action === "on" ? this.state.version : this.state.version + 1;
    const enabled = action === "purge" ? this.state.enabled : action === "on";
    this.state = { enabled, version: bumped };
    return Promise.resolve(this.state);
  }
}

function setup(shelfSwitch: ShopShelfSwitch = new InMemoryShelfSwitch()) {
  const signals = new RecordingShelfSignals();
  return { signals, handler: new SwitchShelfCacheHandler(shelfSwitch, signals) };
}

describe("SwitchShelfCacheHandler", () => {
  it("éteindre rend l'état relu par le magasin, et le signale", async () => {
    const shelfSwitch = new InMemoryShelfSwitch();
    const { handler, signals } = setup(shelfSwitch);

    const state = await handler.execute(new SwitchShelfCacheCommand("off"));

    expect(state).toEqual({ enabled: false, version: 4 });
    expect(shelfSwitch.actions).toEqual(["off"]);
    expect(signals.emitted).toEqual([{ name: "switched", enabled: false, version: 4 }]);
  });

  it("rallumer est signalé comme un basculement, sans monter la version", async () => {
    const { handler, signals } = setup();

    await handler.execute(new SwitchShelfCacheCommand("off"));
    const state = await handler.execute(new SwitchShelfCacheCommand("on"));

    expect(state).toEqual({ enabled: true, version: 4 });
    expect(signals.emitted.at(-1)).toEqual({ name: "switched", enabled: true, version: 4 });
  });

  it("vider se signale à part d'un basculement", async () => {
    const { handler, signals } = setup();

    const state = await handler.execute(new SwitchShelfCacheCommand("purge"));

    expect(state).toEqual({ enabled: true, version: 4 });
    expect(signals.emitted).toEqual([{ name: "purged_manually", version: 4 }]);
  });

  it("sans magasin configuré, refuse en le nommant et ne signale rien", async () => {
    const { handler, signals } = setup(new NoShopShelfSwitch());

    await expect(handler.execute(new SwitchShelfCacheCommand("off"))).rejects.toBeInstanceOf(
      ShelfCacheNotConfiguredError,
    );
    expect(signals.emitted).toEqual([]);
  });
});
