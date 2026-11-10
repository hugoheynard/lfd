import { ShelfCacheNotConfiguredError } from "../../../domain/errors/shelf-cache-not-configured.error.js";
import {
  ShopShelfSwitch,
  type ShelfCacheState,
  type ShelfSwitchAction,
} from "../../../domain/ports/shop-shelf-switch.js";
import { NoShopShelfSwitch } from "../../../infrastructure/no-shop-shelf-switch.js";
import { InMemoryPublicShelf, publicRig } from "../../__tests__/public-shelf-doubles.js";
import { SwitchShelfCacheCommand } from "../switch-shelf-cache.command.js";
import { SwitchShelfCacheHandler } from "../switch-shelf-cache.handler.js";

/**
 * Un interrupteur en mémoire, qui suit les règles de l'objet
 * (`container/shelf-store.ts`, `switchPlan`) : éteindre et vider montent la
 * version, éteindre éteint aussi le public, le public démarre éteint.
 */
class InMemoryShelfSwitch extends ShopShelfSwitch {
  readonly actions: ShelfSwitchAction[] = [];
  private state: ShelfCacheState = { enabled: true, publicEnabled: false, version: 3 };

  apply(action: ShelfSwitchAction): Promise<ShelfCacheState> {
    this.actions.push(action);
    const erases = action === "off" || action === "purge";
    const enabled = action === "on" ? true : action === "off" ? false : this.state.enabled;
    const publicEnabled =
      action === "public-on"
        ? true
        : action === "public-off" || action === "off"
          ? false
          : this.state.publicEnabled;
    this.state = { enabled, publicEnabled, version: this.state.version + (erases ? 1 : 0) };
    return Promise.resolve(this.state);
  }
}

function setup(shelfSwitch: ShopShelfSwitch = new InMemoryShelfSwitch()) {
  const rig = publicRig(new InMemoryPublicShelf());
  return {
    signals: rig.signals,
    publicShelf: rig.shelf,
    cacheability: rig.cacheability,
    handler: new SwitchShelfCacheHandler(shelfSwitch, rig.publicShelf, rig.signals),
  };
}

describe("SwitchShelfCacheHandler", () => {
  it("éteindre rend l'état relu par le magasin, purge le public, et le signale", async () => {
    const shelfSwitch = new InMemoryShelfSwitch();
    const { handler, signals, publicShelf } = setup(shelfSwitch);

    const outcome = await handler.execute(new SwitchShelfCacheCommand("off"));

    expect(outcome).toEqual({
      enabled: false,
      publicEnabled: false,
      version: 4,
      publicPurge: "done",
    });
    expect(shelfSwitch.actions).toEqual(["off"]);
    expect(publicShelf.purges).toBe(1);
    expect(signals.emitted).toEqual([
      { name: "switched", enabled: false, version: 4 },
      { name: "public_purged" },
    ]);
  });

  it("rallumer est signalé comme un basculement, sans monter la version ni purger", async () => {
    const { handler, signals, publicShelf } = setup();

    await handler.execute(new SwitchShelfCacheCommand("off"));
    const outcome = await handler.execute(new SwitchShelfCacheCommand("on"));

    expect(outcome).toEqual({
      enabled: true,
      publicEnabled: false,
      version: 4,
      publicPurge: "not_needed",
    });
    expect(publicShelf.purges).toBe(1);
    expect(signals.emitted.at(-1)).toEqual({ name: "switched", enabled: true, version: 4 });
  });

  it("vider se signale à part d'un basculement, et purge aussi le public", async () => {
    const { handler, signals, publicShelf } = setup();

    const outcome = await handler.execute(new SwitchShelfCacheCommand("purge"));

    expect(outcome).toMatchObject({ enabled: true, version: 4, publicPurge: "done" });
    expect(publicShelf.purges).toBe(1);
    expect(signals.emitted).toEqual([
      { name: "purged_manually", version: 4 },
      { name: "public_purged" },
    ]);
  });

  it("allumer le public le signale à part, sans purge", async () => {
    const { handler, signals, publicShelf } = setup();

    const outcome = await handler.execute(new SwitchShelfCacheCommand("public-on"));

    expect(outcome).toEqual({
      enabled: true,
      publicEnabled: true,
      version: 3,
      publicPurge: "not_needed",
    });
    expect(publicShelf.purges).toBe(0);
    expect(signals.emitted).toEqual([{ name: "public_switched", enabled: true, version: 3 }]);
  });

  it("éteindre le public purge Workers Cache, et une purge perdue se dit dans la réponse", async () => {
    const { handler, signals, publicShelf } = setup();
    publicShelf.purgeFails = true;

    await handler.execute(new SwitchShelfCacheCommand("public-on"));
    const outcome = await handler.execute(new SwitchShelfCacheCommand("public-off"));

    expect(outcome).toMatchObject({ publicEnabled: false, publicPurge: "failed" });
    expect(signals.names()).toContain("public_purge_failed");
    expect(signals.emitted).toContainEqual({ name: "public_switched", enabled: false, version: 3 });
  });

  it("une bascule dans cette instance oublie la mémoire du drapeau : la réponse suivante relit l'objet", async () => {
    const { handler, publicShelf, cacheability } = setup();
    await cacheability.around(() => Promise.resolve("rayon"));
    expect(publicShelf.reads).toBe(1);

    await handler.execute(new SwitchShelfCacheCommand("public-on"));
    publicShelf.enabled = true;
    const reply = await cacheability.around(() => Promise.resolve("rayon"));

    expect(reply.cacheable).toBe(true);
    expect(publicShelf.reads).toBe(3);
  });

  it("un geste refusé oublie aussi la mémoire : il a pu basculer avant de répondre", async () => {
    const { handler, publicShelf, cacheability } = setup(new NoShopShelfSwitch());
    await cacheability.around(() => Promise.resolve("rayon"));

    await expect(handler.execute(new SwitchShelfCacheCommand("public-on"))).rejects.toBeInstanceOf(
      ShelfCacheNotConfiguredError,
    );
    await cacheability.around(() => Promise.resolve("rayon"));

    expect(publicShelf.reads).toBe(2);
  });

  it("sans magasin configuré, refuse en le nommant et ne signale ni ne purge rien", async () => {
    const { handler, signals, publicShelf } = setup(new NoShopShelfSwitch());

    await expect(handler.execute(new SwitchShelfCacheCommand("off"))).rejects.toBeInstanceOf(
      ShelfCacheNotConfiguredError,
    );
    expect(signals.emitted).toEqual([]);
    expect(publicShelf.purges).toBe(0);
  });
});
