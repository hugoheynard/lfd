import { DurableObjectDayContentsCache } from "../durable-object-day-contents-cache.js";
import { DurableObjectDayVersionsCache } from "../durable-object-day-versions-cache.js";
import { DurableObjectVersionedContentCache } from "../durable-object-versioned-content-cache.js";

/**
 * Régression : un « absent » (404) de l'objet des journées était gardé par
 * le Workers Cache du point d'entrée de sortie, et resservi à l'API.
 */
interface Sent {
  readonly method: string | undefined;
  readonly cacheControl: string | null;
}

function recording(status: number): {
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
      return Promise.resolve(new Response(null, { status }));
    },
  };
}

const PACKED = { bytes: new Uint8Array([1]), rawBytes: 1 };
const NO_STORE = [
  { method: "GET", cacheControl: "no-store" },
  { method: "PUT", cacheControl: "no-store" },
];

describe("les appels de l'API aux objets des journées ne sont jamais gardés", () => {
  it("contenus de journée : GET et PUT portent no-store", async () => {
    const { sent, fetchFn } = recording(201);
    const cache = new DurableObjectDayContentsCache("http://o", "r", fetchFn);
    const address = { screen: "worksheet", day: "2030-03-12", tag: "t" };
    await cache.read(address).catch(() => null);
    await cache.store(address, PACKED).catch(() => null);
    expect(sent).toEqual(NO_STORE);
  });

  it("numéros de journée : GET et PUT portent no-store", async () => {
    const { sent, fetchFn } = recording(201);
    const cache = new DurableObjectDayVersionsCache("http://o", "r", fetchFn);
    await cache.read("2030-03-12").catch(() => null);
    await cache.store("2030-03-12", { subjects: {} }).catch(() => null);
    expect(sent).toEqual(NO_STORE);
  });

  it("contenus versionnés : GET et PUT portent no-store", async () => {
    const { sent, fetchFn } = recording(201);
    const cache = new DurableObjectVersionedContentCache("http://o", "r", fetchFn);
    await cache.read("pim:k", 1).catch(() => null);
    await cache.store("pim:k", 1, PACKED).catch(() => null);
    expect(sent).toEqual(NO_STORE);
  });
});
