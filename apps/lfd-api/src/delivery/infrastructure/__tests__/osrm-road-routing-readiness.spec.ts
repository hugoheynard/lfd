import type { FetchFn } from "../ban-geocoder.js";
import { DisabledRoadRoutingReadiness } from "../disabled-road-routing.js";
import { OsrmRoadRoutingReadiness } from "../osrm-road-routing-readiness.js";
import { WAKE_POINT } from "../osrm-road-routing-waker.js";

const ENDPOINT = { url: "https://lafoliecoffee.info/api/route-planner/", token: "t".repeat(64) };

function probe(answer: FetchFn, calls: { url: string; init: RequestInit }[] = []) {
  const fetchFn: FetchFn = (url, init) => {
    calls.push({ url, init });
    return answer(url, init);
  };
  return new OsrmRoadRoutingReadiness(ENDPOINT, fetchFn, 20);
}

const replying =
  (body: unknown, status: number): FetchFn =>
  () =>
    Promise.resolve(Response.json(body, { status }));

/** Ne répond jamais : seule l'expiration du signal rend la main. */
const hanging: FetchFn = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      reject(new DOMException("aborted", "AbortError"));
    });
  });

describe("la disponibilité du calcul routier — un sondage d'un seul essai", () => {
  it("prêt quand OSRM répond 200 { code: Ok }, par le /route du réveil et avec le jeton", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    await expect(probe(replying({ code: "Ok" }, 200), calls).isReady()).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://lafoliecoffee.info/api/route-planner/route/v1/driving/${WAKE_POINT};${WAKE_POINT}?overview=false`,
    );
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(
      `Bearer ${"t".repeat(64)}`,
    );
  });

  it("pas prêt sur un 503 du réveil, sans nouvel essai", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    await expect(probe(replying({ code: "LfdOsrmWaking" }, 503), calls).isReady()).resolves.toBe(
      false,
    );
    expect(calls).toHaveLength(1);
  });

  it("pas prêt quand le délai expire", async () => {
    await expect(probe(hanging).isReady()).resolves.toBe(false);
  });

  it("pas prêt sur un 200 dont le code n'est pas Ok", async () => {
    await expect(probe(replying({ code: "NoRoute" }, 200)).isReady()).resolves.toBe(false);
  });

  it("pas prêt sur un corps illisible", async () => {
    const answer: FetchFn = () => Promise.resolve(new Response("<html>", { status: 200 }));

    await expect(probe(answer).isReady()).resolves.toBe(false);
  });

  it("pas prêt sur une coupure réseau, sans lever", async () => {
    const answer: FetchFn = () => Promise.reject(new TypeError("fetch failed"));

    await expect(probe(answer).isReady()).resolves.toBe(false);
  });

  it("sans ROUTE_PLANNER_URL, prêt : il n'y a rien à attendre", async () => {
    await expect(new DisabledRoadRoutingReadiness().isReady()).resolves.toBe(true);
  });
});
