import { UnreadableShelfReplyError } from "../../domain/errors/unreadable-shelf-reply.error.js";
import type { ShelfFetch } from "../durable-object-shop-shelf-cache.js";
import { InternalPublicShelf } from "../internal-public-shelf.js";

/**
 * Le rayon public par `rayons.interne`, contre des réponses fabriquées — le
 * contrat que `container/pro-shelves.ts` (état) et `container/worker.ts`
 * (purge) servent.
 */
const ORIGIN = "http://rayons.interne/";

function replying(response: () => Response): {
  readonly sent: { url: string; method: string | undefined }[];
  readonly fetchFn: ShelfFetch;
} {
  const sent: { url: string; method: string | undefined }[] = [];
  return {
    sent,
    fetchFn: (url, init) => {
      sent.push({ url, method: init.method });
      return Promise.resolve(response());
    },
  };
}

describe("InternalPublicShelf", () => {
  it("lit le drapeau et la version au chemin de l'état", async () => {
    const { sent, fetchFn } = replying(() => Response.json({ publicEnabled: true, version: 9 }));

    const state = await new InternalPublicShelf(ORIGIN, fetchFn).read();

    expect(state).toEqual({ enabled: true, version: 9 });
    expect(sent).toEqual([{ url: "http://rayons.interne/public/state", method: "GET" }]);
  });

  it.each([
    ["sans drapeau", { version: 1 }],
    ["version négative", { publicEnabled: true, version: -1 }],
    ["version non entière", { publicEnabled: true, version: 1.5 }],
  ])("un état illisible (%s) remonte", async (_case, body) => {
    const { fetchFn } = replying(() => Response.json(body));

    await expect(new InternalPublicShelf(ORIGIN, fetchFn).read()).rejects.toBeInstanceOf(
      UnreadableShelfReplyError,
    );
  });

  it("un refus du gestionnaire (403) remonte, il ne passe pas pour un drapeau éteint", async () => {
    const { fetchFn } = replying(() => new Response(null, { status: 403 }));

    await expect(new InternalPublicShelf(ORIGIN, fetchFn).read()).rejects.toBeInstanceOf(
      UnreadableShelfReplyError,
    );
  });

  it("purge par un POST au Worker ; seul 204 vaut « purgé »", async () => {
    const ok = replying(() => new Response(null, { status: 204 }));
    await new InternalPublicShelf(ORIGIN, ok.fetchFn).purge();
    expect(ok.sent).toEqual([{ url: "http://rayons.interne/public/purge", method: "POST" }]);

    for (const status of [502, 503, 200]) {
      const refused = replying(() => new Response(null, { status }));
      await expect(new InternalPublicShelf(ORIGIN, refused.fetchFn).purge()).rejects.toBeInstanceOf(
        UnreadableShelfReplyError,
      );
    }
  });
});
