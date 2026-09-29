import { UnknownCostPointError } from "../../domain/errors/delivery-routing-errors.js";
import { CrowFliesDistanceMatrix } from "../../domain/services/crow-flies-distance-matrix.js";
import { type GeoPoint, geoPoint } from "../../domain/value-objects/geo-point.js";
import { RoutingSettings } from "../../domain/value-objects/routing-settings.js";
import type { FetchFn } from "../ban-geocoder.js";
import { OSRM_MAX_TABLE_POINTS, OsrmDistanceMatrix } from "../osrm-distance-matrix.js";
import { OSRM_TABLE_SAVOIE, OSRM_TABLE_UNREACHABLE } from "./osrm-responses.js";

/** Val d'Isère (le labo), Arc 1800, Courchevel 1850 — les points de la réponse enregistrée. */
const POINTS: ReadonlyMap<string, GeoPoint> = new Map([
  ["depot", geoPoint(45.4486, 6.9797)],
  ["arc", geoPoint(45.5724, 6.7713)],
  ["courchevel", geoPoint(45.413, 6.6327)],
]);

const SETTINGS = RoutingSettings.defaults();

/** Un `fetch` enregistré : il note ce qu'on lui demande, et rend la réponse donnée. */
class RecordedFetch {
  readonly calls: { readonly url: string; readonly init: RequestInit }[] = [];

  constructor(private readonly answer: (init: RequestInit) => Promise<Response>) {}

  readonly fetch: FetchFn = (url, init) => {
    this.calls.push({ url, init });
    return this.answer(init);
  };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(Response.json(body, { status }));

function matrix(recorded: RecordedFetch, timeoutMs?: number): OsrmDistanceMatrix {
  return new OsrmDistanceMatrix(
    "http://osrm.internal/",
    new CrowFliesDistanceMatrix(),
    recorded.fetch,
    timeoutMs,
  );
}

describe("les coûts par la route — OSRM /table (lot 8)", () => {
  it("lit une vraie réponse de la carte de Savoie : durées et distances, asymétriques", async () => {
    const cost = await matrix(new RecordedFetch(json(OSRM_TABLE_SAVOIE))).build(POINTS, SETTINGS);

    expect(cost.estimate).toBe("road");
    expect(cost.seconds("depot", "arc")).toBe(3052);
    expect(cost.meters("depot", "courchevel")).toBe(83708.7);
    // Pris tels quels : l'ordonnanceur est ATSP.
    expect(cost.seconds("arc", "courchevel")).toBe(4378.1);
    expect(cost.seconds("courchevel", "arc")).toBe(4396.9);
  });

  it("appelle UNE fois /table, en longitude,latitude, avec un délai", async () => {
    const recorded = new RecordedFetch(json(OSRM_TABLE_SAVOIE));

    await matrix(recorded).build(POINTS, SETTINGS);

    expect(recorded.calls).toHaveLength(1);
    const [call] = recorded.calls;
    expect(call?.url).toBe(
      "http://osrm.internal/table/v1/driving/6.9797,45.4486;6.7713,45.5724;6.6327,45.413?annotations=duration,distance",
    );
    expect(call?.init.method).toBe("GET");
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuse un point qu'il ne connaît pas, comme le vol d'oiseau", async () => {
    const cost = await matrix(new RecordedFetch(json(OSRM_TABLE_SAVOIE))).build(POINTS, SETTINGS);

    expect(() => cost.seconds("depot", "meribel")).toThrow(UnknownCostPointError);
  });

  describe("retombe sur le vol d'oiseau, et le dit", () => {
    const crowFlies = (): Promise<number> =>
      new CrowFliesDistanceMatrix()
        .build(POINTS, SETTINGS)
        .then((cost) => cost.seconds("depot", "courchevel"));

    it.each([
      ["le Worker rend 503", json({ code: "LfdOsrmRefused" }, 503)],
      ["OSRM refuse la requête", json({ code: "InvalidQuery" }, 400)],
      [
        "le corps n'est pas du JSON",
        () => Promise.resolve(new Response("<html>", { status: 200 })),
      ],
      ["`code` n'est pas Ok", json({ ...OSRM_TABLE_SAVOIE, code: "NoTable" })],
      ["la matrice n'a pas la bonne taille", json({ ...OSRM_TABLE_SAVOIE, durations: [[0]] })],
      ["un trajet est introuvable (case null)", json(OSRM_TABLE_UNREACHABLE)],
      ["la coupure réseau", () => Promise.reject(new TypeError("fetch failed"))],
    ])("quand %s", async (_case, answer) => {
      const cost = await matrix(new RecordedFetch(answer)).build(POINTS, SETTINGS);

      expect(cost.estimate).toBe("crow_flies");
      expect(cost.seconds("depot", "courchevel")).toBe(await crowFlies());
    });

    it("quand OSRM ne répond pas dans le délai", async () => {
      // Un `fetch` qui ne répond jamais, et ne cède qu'au signal : c'est bien
      // le délai de l'adaptateur qui coupe, pas le double.
      const silent = new RecordedFetch(
        (init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );

      const cost = await matrix(silent, 20).build(POINTS, SETTINGS);

      expect(cost.estimate).toBe("crow_flies");
    });
  });

  /**
   * Régression : au-delà de la borne, la proposition était refusée (409) dès
   * qu'OSRM était branché, alors que le vol d'oiseau la tenait (2026-09-29).
   */
  it(`retombe au vol d'oiseau au-delà de ${String(OSRM_MAX_TABLE_POINTS)} points — sans appeler OSRM`, async () => {
    const recorded = new RecordedFetch(json(OSRM_TABLE_SAVOIE));
    const many = new Map<string, GeoPoint>(
      Array.from({ length: OSRM_MAX_TABLE_POINTS + 1 }, (_, index) => [
        `p${String(index)}`,
        geoPoint(45.4, 6.6 + index / 10_000),
      ]),
    );

    const cost = await matrix(recorded).build(many, SETTINGS);
    expect(cost.estimate).toBe("crow_flies");
    expect(recorded.calls).toHaveLength(0);
  });

  it(`accepte exactement ${String(OSRM_MAX_TABLE_POINTS)} points`, async () => {
    const recorded = new RecordedFetch(json({ code: "NoTable" }));
    const limit = new Map<string, GeoPoint>(
      Array.from({ length: OSRM_MAX_TABLE_POINTS }, (_, index) => [
        `p${String(index)}`,
        geoPoint(45.4, 6.6 + index / 10_000),
      ]),
    );

    await matrix(recorded).build(limit, SETTINGS);

    expect(recorded.calls).toHaveLength(1);
  });
});
