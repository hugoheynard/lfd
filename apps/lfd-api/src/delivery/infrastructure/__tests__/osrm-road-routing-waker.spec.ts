import type { FetchFn } from "../ban-geocoder.js";
import { DisabledRoadRoutingWaker } from "../disabled-road-routing.js";
import { OsrmRoadRoutingWaker, WAKE_POINT } from "../osrm-road-routing-waker.js";
import { InstantPacing } from "./osrm-pacing-double.js";

function waker(answers: readonly number[], calls: { url: string; init: RequestInit }[]) {
  const fetchFn: FetchFn = (url, init) => {
    const status = answers[calls.length] ?? 200;
    calls.push({ url, init });
    return Promise.resolve(
      Response.json(status === 200 ? { code: "Ok" } : { code: "LfdOsrmRefused" }, { status }),
    );
  };
  const pacing = new InstantPacing();
  return {
    pacing,
    waker: new OsrmRoadRoutingWaker(
      { url: "https://lafoliecoffee.info/api/route-planner/", token: "t".repeat(64) },
      pacing,
      fetchFn,
      20,
    ),
  };
}

describe("le réveil du calcul routier — un /route minimal (2026-11-01)", () => {
  it("appelle /route sur un point de la carte, avec le jeton de la passerelle", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    await waker([], calls).waker.wake();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://lafoliecoffee.info/api/route-planner/route/v1/driving/${WAKE_POINT};${WAKE_POINT}?overview=false`,
    );
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(
      `Bearer ${"t".repeat(64)}`,
    );
  });

  it("attend le réveil : rejoue les 503 jusqu'à la réponse", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const { waker: wakeUp, pacing } = waker([503, 503], calls);

    await wakeUp.wake();

    expect(calls).toHaveLength(3);
    expect(pacing.pauses).toHaveLength(2);
  });

  it("ne lève jamais, même quand OSRM refuse", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    await expect(waker([400], calls).waker.wake()).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it("sans ROUTE_PLANNER_URL, rien ne part", async () => {
    await expect(new DisabledRoadRoutingWaker().wake()).resolves.toBeUndefined();
  });
});
