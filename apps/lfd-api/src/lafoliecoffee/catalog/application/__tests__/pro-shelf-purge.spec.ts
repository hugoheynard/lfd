import { InMemoryShopShelfCache } from "../../infrastructure/in-memory-shop-shelf-cache.js";
import { ProShelfPurge } from "../pro-shelf-purge.js";
import { BrokenShelfCache, resilientAround } from "./shelf-cache-doubles.js";

/** La purge de la fenêtre efface dans le magasin des rayons pro (C2). */
describe("ProShelfPurge", () => {
  const LATER = new Date(Date.UTC(2030, 0, 2));
  const VIEW = { shelves: [], items: [], operations: [] };

  it("efface les sociétés de la fenêtre, et monte la version", async () => {
    const cache = new InMemoryShopShelfCache();
    await cache.store({ key: "co_a", view: VIEW, version: 0, principalId: null, expiresAt: LATER });
    await cache.store({ key: "co_b", view: VIEW, version: 0, principalId: null, expiresAt: LATER });
    const { resilient, signals } = resilientAround(cache);

    await new ProShelfPurge(resilient).purge({
      order: { kind: "companies", companyIds: ["co_a"] },
      windowOpenedAt: new Date(0),
    });

    expect(cache.keys()).toEqual(["co_b"]);
    expect(
      await cache.store({
        key: "co_c",
        view: VIEW,
        version: 0,
        principalId: null,
        expiresAt: LATER,
      }),
    ).toBe("stale");
    expect(signals.emitted).toEqual([{ name: "erased", scope: "companies", companies: 1 }]);
  });

  it("un magasin en panne : la purge ne lève pas, elle est comptée", async () => {
    const { resilient, signals } = resilientAround(new BrokenShelfCache("throws"));

    await expect(
      new ProShelfPurge(resilient).purge({ order: { kind: "all" }, windowOpenedAt: new Date(0) }),
    ).resolves.toBeUndefined();

    expect(signals.emitted).toEqual([{ name: "fallback", operation: "erase", reason: "error" }]);
  });
});
