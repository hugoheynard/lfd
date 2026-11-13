import type { ShopCatalogueView } from "@lfd/contracts";

import { DurableObjectShopShelfCache } from "../durable-object-shop-shelf-cache.js";
import { InternalPublicShelf } from "../internal-public-shelf.js";

/** Régression : une réponse des objets internes pouvait être gardée en chemin et resservie. */
interface Sent {
  readonly method: string | undefined;
  readonly cacheControl: string | null;
}

function recording(): {
  readonly sent: Sent[];
  readonly fetchFn: (url: string, init: RequestInit) => Promise<Response>;
} {
  const sent: Sent[] = [];
  return {
    sent,
    fetchFn: (_url, init) => {
      sent.push({
        method: init.method,
        cacheControl: new Headers(init.headers).get("cache-control"),
      });
      return Promise.resolve(new Response(null, { status: 201 }));
    },
  };
}

const NOW = new Date(Date.UTC(2030, 0, 1));
const VIEW: ShopCatalogueView = { shelves: [], items: [], operations: [] };

describe("les appels de l'API aux objets des rayons ne sont jamais gardés", () => {
  it("rayons pro : GET et PUT portent no-store", async () => {
    const { sent, fetchFn } = recording();
    const cache = new DurableObjectShopShelfCache("http://o", "r", fetchFn);
    await cache.read("co_a", NOW).catch(() => null);
    await cache
      .store({ key: "co_a", view: VIEW, version: 1, principalId: null, expiresAt: NOW })
      .catch(() => null);
    expect(sent).toEqual([
      { method: "GET", cacheControl: "no-store" },
      { method: "PUT", cacheControl: "no-store" },
    ]);
  });

  it("rayon public : la lecture de l'état porte no-store", async () => {
    const { sent, fetchFn } = recording();
    await new InternalPublicShelf("http://o", fetchFn).read().catch(() => null);
    expect(sent).toEqual([{ method: "GET", cacheControl: "no-store" }]);
  });
});
