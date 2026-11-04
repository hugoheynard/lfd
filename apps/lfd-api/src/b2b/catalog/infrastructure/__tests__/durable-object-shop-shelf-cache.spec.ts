import type { ShopCatalogueView } from "@lfd/contracts";

import { UnreadableShelfReplyError } from "../../domain/errors/unreadable-shelf-reply.error.js";
import {
  DurableObjectShopShelfCache,
  type ShelfFetch,
} from "../durable-object-shop-shelf-cache.js";
import { packedShelf, shelfPath } from "../shelf-wire.js";

/**
 * L'adaptateur HTTP du magasin des rayons pro, contre des réponses fabriquées
 * — le contrat que `container/shelf-store.ts` sert de l'autre côté. Les dates
 * ne sont comparées à aucune horloge : elles ne font que traverser.
 */
const ORIGIN = "http://rayons.interne";
const NOW = new Date(Date.UTC(2030, 0, 1));
const VIEW: ShopCatalogueView = { shelves: [], items: [], operations: [] };

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

function replying(response: () => Response | Promise<Response>): {
  readonly sent: Sent[];
  readonly fetchFn: ShelfFetch;
} {
  const sent: Sent[] = [];
  return {
    sent,
    fetchFn: async (url, init) => {
      sent.push({ url, init });
      return response();
    },
  };
}

describe("DurableObjectShopShelfCache", () => {
  it("lit un rayon rangé, compressé, à l'instant de l'API", async () => {
    const bytes = await packedShelf(VIEW);
    const { sent, fetchFn } = replying(() => new Response(bytes, { status: 200 }));

    const lookup = await new DurableObjectShopShelfCache(ORIGIN, fetchFn).read("co_a", NOW);

    expect(lookup).toEqual({ kind: "hit", view: VIEW });
    expect(sent[0]?.url).toBe(`${ORIGIN}/shelves/company/co_a?now=${NOW.getTime()}`);
  });

  it("un raté porte la version courante", async () => {
    const { fetchFn } = replying(
      () => new Response(null, { status: 404, headers: { "x-shelf-version": "12" } }),
    );

    await expect(new DurableObjectShopShelfCache(ORIGIN, fetchFn).read(null, NOW)).resolves.toEqual(
      {
        kind: "miss",
        version: 12,
      },
    );
  });

  it.each<[string, () => Response]>([
    ["un raté sans version", () => new Response(null, { status: 404 })],
    [
      "un statut inattendu (le refus d'un appelant étranger)",
      () => new Response(null, { status: 403 }),
    ],
    ["des octets qui ne sont pas un rayon", () => new Response("pas du gzip", { status: 200 })],
  ])("%s est une réponse illisible", async (_case, response) => {
    const { fetchFn } = replying(response);

    await expect(
      new DurableObjectShopShelfCache(ORIGIN, fetchFn).read("co_a", NOW),
    ).rejects.toBeInstanceOf(UnreadableShelfReplyError);
  });

  it.each<[number, string]>([
    [201, "stored"],
    [409, "stale"],
  ])("un rangement répondu %i vaut %s", async (status, outcome) => {
    const { sent, fetchFn } = replying(() => new Response(null, { status }));
    const expiresAt = new Date(NOW.getTime() + 30_000);

    const stored = await new DurableObjectShopShelfCache(ORIGIN, fetchFn).store({
      key: "co_site",
      view: VIEW,
      version: 3,
      principalId: "co_head",
      expiresAt,
    });

    expect(stored).toBe(outcome);
    const url = new URL(sent[0]?.url ?? "");
    expect(url.pathname).toBe("/shelves/company/co_site");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      version: "3",
      expires: String(expiresAt.getTime()),
      principal: "co_head",
    });
    expect(sent[0]?.init.method).toBe("PUT");
  });

  it("un effacement envoie l'ordre regroupé, tel quel", async () => {
    const { sent, fetchFn } = replying(() => new Response(null, { status: 204 }));

    await new DurableObjectShopShelfCache(ORIGIN, fetchFn).erase({
      kind: "companies",
      companyIds: ["co_a"],
    });

    expect(sent[0]?.url).toBe(`${ORIGIN}/erase`);
    expect(sent[0]?.init.body).toBe(JSON.stringify({ kind: "companies", companyIds: ["co_a"] }));
  });

  it("une panne réseau remonte telle quelle (le repli la compte `error`)", async () => {
    const fetchFn: ShelfFetch = () => Promise.reject(new TypeError("fetch failed"));

    await expect(
      new DurableObjectShopShelfCache(ORIGIN, fetchFn).read("co_a", NOW),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("l'espace perso et une société ne partagent jamais un chemin", () => {
    expect(shelfPath(null)).toBe("/shelves/personal");
    expect(shelfPath("personal")).toBe("/shelves/company/personal");
    expect(shelfPath("a/b")).toBe("/shelves/company/a%2Fb");
  });
});
