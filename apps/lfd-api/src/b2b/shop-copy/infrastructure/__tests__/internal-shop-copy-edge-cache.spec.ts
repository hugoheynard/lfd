import {
  InternalShopCopyEdgeCache,
  ShopCopyEdgePurgeFailedError,
  type EdgePurgeFetch,
} from "../internal-shop-copy-edge-cache.js";

/**
 * La purge des textes par le chemin interne du Worker. Ces tests échouent si
 * elle vise une autre étiquette que celle des textes, ou si un refus du
 * Worker passe pour un succès.
 */
function recording(status: number) {
  const calls: { url: string; method: string | undefined }[] = [];
  const fetchFn: EdgePurgeFetch = (url, init) => {
    calls.push({ url, method: init.method });
    return Promise.resolve(new Response(null, { status }));
  };
  return { calls, fetchFn };
}

describe("InternalShopCopyEdgeCache", () => {
  it("demande au Worker la purge de l'étiquette des textes, en POST", async () => {
    const { calls, fetchFn } = recording(204);

    await new InternalShopCopyEdgeCache("http://rayons.interne/", fetchFn).purge();

    expect(calls).toEqual([
      { url: "http://rayons.interne/public/purge?tag=textes-boutique", method: "POST" },
    ]);
  });

  it.each([400, 403, 502, 503])("un refus du Worker (%i) lève, nommé", async (status) => {
    const { fetchFn } = recording(status);

    await expect(
      new InternalShopCopyEdgeCache("http://rayons.interne", fetchFn).purge(),
    ).rejects.toBeInstanceOf(ShopCopyEdgePurgeFailedError);
  });
});
