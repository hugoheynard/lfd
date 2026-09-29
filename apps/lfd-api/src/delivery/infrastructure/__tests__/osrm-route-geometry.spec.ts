import { geoPoint } from "../../domain/value-objects/geo-point.js";
import type { FetchFn } from "../ban-geocoder.js";
import { DisabledRouteGeometry } from "../disabled-road-routing.js";
import { OsrmRouteGeometry } from "../osrm-route-geometry.js";
import { OSRM_ROUTE_VAL_ARC } from "./osrm-responses.js";

const VAL = geoPoint(45.4486, 6.9797);
const ARC = geoPoint(45.5724, 6.7713);

function geometry(answer: () => Promise<Response>, calls: string[] = []): OsrmRouteGeometry {
  const fetchFn: FetchFn = (url) => {
    calls.push(url);
    return answer();
  };
  return new OsrmRouteGeometry({ url: "http://localhost:5055/", token: null }, fetchFn, 20);
}

describe("le tracé par la route — OSRM /route (L10b-C4)", () => {
  it("lit une vraie réponse : des paires [lng, lat], dans l'ordre", async () => {
    const calls: string[] = [];

    const line = await geometry(
      () => Promise.resolve(Response.json(OSRM_ROUTE_VAL_ARC)),
      calls,
    ).trace([VAL, ARC, VAL]);

    expect(calls).toEqual([
      "http://localhost:5055/route/v1/driving/6.9797,45.4486;6.7713,45.5724;6.9797,45.4486?overview=simplified&geometries=geojson",
    ]);
    expect(line).toEqual(OSRM_ROUTE_VAL_ARC.routes[0].geometry.coordinates);
    expect(line?.[0]).toEqual([6.979732, 45.448598]);
  });

  it("présente le jeton en `Authorization: Bearer` quand il y en a un (L8b-C2)", async () => {
    const seen: RequestInit[] = [];
    const token = "t".repeat(64);
    const traced = new OsrmRouteGeometry(
      { url: "https://lafoliecoffee.info/api/osrm", token },
      (_url, init) => {
        seen.push(init);
        return Promise.resolve(Response.json(OSRM_ROUTE_VAL_ARC));
      },
      20,
    );

    await traced.trace([VAL, ARC]);

    expect(new Headers(seen[0]?.headers).get("authorization")).toBe(`Bearer ${token}`);
  });

  it.each([
    ["OSRM refuse", () => Promise.resolve(Response.json({ code: "NoRoute" }, { status: 400 }))],
    ["`code` n'est pas Ok", () => Promise.resolve(Response.json({ code: "NoRoute" }))],
    [
      "une paire illisible",
      () =>
        Promise.resolve(
          Response.json({
            code: "Ok",
            routes: [
              {
                geometry: {
                  coordinates: [
                    [6.9, "x"],
                    [6.8, 45.5],
                  ],
                },
              },
            ],
          }),
        ),
    ],
    ["la coupure réseau", () => Promise.reject(new TypeError("fetch failed"))],
  ])("rend `null` quand %s — jamais une erreur", async (_case, answer) => {
    await expect(geometry(answer).trace([VAL, ARC, VAL])).resolves.toBeNull();
  });

  it("ne demande rien pour moins de deux points", async () => {
    const calls: string[] = [];

    await expect(
      geometry(() => Promise.reject(new Error("jamais")), calls).trace([VAL]),
    ).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it("sans OSRM_URL, aucun tracé", async () => {
    await expect(new DisabledRouteGeometry().trace()).resolves.toBeNull();
  });
});
