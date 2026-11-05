import {
  InternalPublicSettingsEdgeCache,
  PublicSettingsEdgePurgeFailedError,
  type PublicSettingsPurgeFetch,
} from "../internal-public-settings-edge-cache.js";
import { NoPublicSettingsEdgeCache } from "../no-public-settings-edge-cache.js";

/**
 * La purge des réglages publics par le chemin interne du Worker. Ces tests
 * échouent si elle vise une autre étiquette que `reglages-publics`, ou si un
 * refus du Worker passe pour un succès.
 */
function recording(status: number) {
  const calls: { url: string; method: string | undefined }[] = [];
  const fetchFn: PublicSettingsPurgeFetch = (url, init) => {
    calls.push({ url, method: init.method });
    return Promise.resolve(new Response(null, { status }));
  };
  return { calls, fetchFn };
}

describe("InternalPublicSettingsEdgeCache", () => {
  it("demande au Worker la purge de l'étiquette des réglages publics, en POST", async () => {
    const { calls, fetchFn } = recording(204);

    await new InternalPublicSettingsEdgeCache("http://rayons.interne/", fetchFn).purge();

    expect(calls).toEqual([
      { url: "http://rayons.interne/public/purge?tag=reglages-publics", method: "POST" },
    ]);
  });

  it.each([400, 403, 502, 503])("un refus du Worker (%i) lève, nommé", async (status) => {
    const { fetchFn } = recording(status);

    await expect(
      new InternalPublicSettingsEdgeCache("http://rayons.interne", fetchFn).purge(),
    ).rejects.toBeInstanceOf(PublicSettingsEdgePurgeFailedError);
  });
});

describe("NoPublicSettingsEdgeCache", () => {
  it("sans Worker, ne fait rien et n'échoue pas", async () => {
    await expect(new NoPublicSettingsEdgeCache().purge()).resolves.toBeUndefined();
  });
});
