import {
  RoadRoutingUnavailableError,
  UnknownCostPointError,
} from "../../domain/errors/delivery-routing-errors.js";
import { type GeoPoint, geoPoint } from "../../domain/value-objects/geo-point.js";
import type { FetchFn } from "../ban-geocoder.js";
import { DisabledDistanceMatrix } from "../disabled-road-routing.js";
import {
  OSRM_MAX_TABLE_POINTS,
  OsrmDistanceMatrix,
  type OsrmTableOptions,
} from "../osrm-distance-matrix.js";
import {
  OSRM_TABLE_FOUR,
  OSRM_TABLE_FOUR_BLOCKS,
  OSRM_TABLE_SAVOIE,
  OSRM_TABLE_UNREACHABLE,
} from "./osrm-responses.js";
import { OSRM_WAKE_BUDGET_MS, OSRM_WAKE_PAUSES_MS } from "../osrm-fetch.js";
import { InstantPacing } from "./osrm-pacing-double.js";

/** Val d'Isère (le labo), Arc 1800, Courchevel 1850 — les points de la réponse enregistrée. */
const POINTS: ReadonlyMap<string, GeoPoint> = new Map([
  ["depot", geoPoint(45.4486, 6.9797)],
  ["arc", geoPoint(45.5724, 6.7713)],
  ["courchevel", geoPoint(45.413, 6.6327)],
]);

/** Les mêmes, et Méribel : les points des blocs enregistrés. */
const FOUR: ReadonlyMap<string, GeoPoint> = new Map([
  ...POINTS,
  ["meribel", geoPoint(45.3969, 6.566)],
]);

const BASE = "http://localhost:5055/table/v1/driving/";

/** Un `fetch` enregistré : il note ce qu'on lui demande, et rend la réponse donnée. */
class RecordedFetch {
  readonly calls: { readonly url: string; readonly init: RequestInit }[] = [];

  constructor(private readonly answer: (init: RequestInit, url: string) => Promise<Response>) {}

  readonly fetch: FetchFn = (url, init) => {
    this.calls.push({ url, init });
    return this.answer(init, url);
  };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(Response.json(body, { status }));

/** Rend le bloc enregistré dont l'URL est demandée ; sinon, 404 — l'URL serait fausse. */
const blocks = (failing: string | null = null) =>
  new RecordedFetch((_init, url) => {
    const key = url.slice(BASE.length);
    const body = OSRM_TABLE_FOUR_BLOCKS[key];
    if (key === failing) {
      return Promise.resolve(Response.json({ code: "InvalidQuery" }, { status: 400 }));
    }
    return Promise.resolve(
      body === undefined ? new Response("", { status: 404 }) : Response.json(body),
    );
  });

function matrix(
  recorded: RecordedFetch,
  options: OsrmTableOptions = {},
  pacing: InstantPacing = new InstantPacing(),
): OsrmDistanceMatrix {
  return new OsrmDistanceMatrix({ url: "http://localhost:5055/", token: null }, pacing, {
    fetchFn: recorded.fetch,
    ...options,
  });
}

/** Deux points par bloc : quatre points font quatre blocs 2 × 2. */
const IN_BLOCKS: OsrmTableOptions = { maxTablePoints: 2, blockPoints: 2, parallelBlocks: 3 };

describe("les coûts par la route — OSRM /table (lot 8)", () => {
  it("lit une vraie réponse de la carte de Savoie : durées et distances, asymétriques", async () => {
    const cost = await matrix(new RecordedFetch(json(OSRM_TABLE_SAVOIE))).build(POINTS);

    expect(cost.seconds("depot", "arc")).toBe(3052);
    expect(cost.meters("depot", "courchevel")).toBe(83708.7);
    // Pris tels quels : l'ordonnanceur est ATSP.
    expect(cost.seconds("arc", "courchevel")).toBe(4378.1);
    expect(cost.seconds("courchevel", "arc")).toBe(4396.9);
  });

  it("appelle UNE fois /table, en longitude,latitude, avec un délai", async () => {
    const recorded = new RecordedFetch(json(OSRM_TABLE_SAVOIE));

    await matrix(recorded).build(POINTS);

    expect(recorded.calls).toHaveLength(1);
    const [call] = recorded.calls;
    expect(call?.url).toBe(
      `${BASE}6.9797,45.4486;6.7713,45.5724;6.6327,45.413?annotations=duration,distance`,
    );
    expect(call?.init.method).toBe("GET");
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  /** Lot 8 bis (L8b-C2) : la passerelle refuse tout appel sans le jeton. */
  it("présente le jeton en `Authorization: Bearer`, jamais dans l'URL", async () => {
    const recorded = new RecordedFetch(json(OSRM_TABLE_SAVOIE));
    const token = "t".repeat(64);

    await new OsrmDistanceMatrix(
      { url: "https://lafoliecoffee.info/api/route-planner", token },
      new InstantPacing(),
      { fetchFn: recorded.fetch },
    ).build(POINTS);

    const [call] = recorded.calls;
    expect(new Headers(call?.init.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(
      call?.url.startsWith("https://lafoliecoffee.info/api/route-planner/table/v1/driving/"),
    ).toBe(true);
    expect(call?.url).not.toContain(token);
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("n'envoie aucun en-tête d'autorisation sans jeton (OSRM local nu)", async () => {
    const recorded = new RecordedFetch(json(OSRM_TABLE_SAVOIE));

    await matrix(recorded).build(POINTS);

    expect(new Headers(recorded.calls[0]?.init.headers).has("authorization")).toBe(false);
  });

  /**
   * Régression (2026-10-07) : un jour déjà composé à l'arrêt du plan ne laisse
   * que le dépôt à router ; OSRM refuse une table d'un seul point (400), et
   * « Proposer » disait « le calcul routier ne répond pas » à tort.
   */
  it("un seul point ne sort pas sur le réseau : rester sur place ne coûte rien", async () => {
    const recorded = new RecordedFetch(json(OSRM_TABLE_SAVOIE));

    const cost = await matrix(recorded).build(new Map([["depot", { lat: 45.4486, lng: 6.9797 }]]));

    expect(recorded.calls).toHaveLength(0);
    expect(cost.seconds("depot", "depot")).toBe(0);
    expect(cost.meters("depot", "depot")).toBe(0);
  });

  it("refuse un point qu'il ne connaît pas", async () => {
    const cost = await matrix(new RecordedFetch(json(OSRM_TABLE_SAVOIE))).build(POINTS);

    expect(() => cost.seconds("depot", "meribel")).toThrow(UnknownCostPointError);
  });

  it(`accepte exactement ${String(OSRM_MAX_TABLE_POINTS)} points en UNE requête`, async () => {
    const recorded = new RecordedFetch(json({ code: "NoTable" }));
    const limit = new Map<string, GeoPoint>(
      Array.from({ length: OSRM_MAX_TABLE_POINTS }, (_, index) => [
        `p${String(index)}`,
        geoPoint(45.4, 6.6 + index / 10_000),
      ]),
    );

    await expect(matrix(recorded).build(limit)).rejects.toThrow(RoadRoutingUnavailableError);
    expect(recorded.calls).toHaveLength(1);
  });
});

describe("au-delà de la borne : par blocs, recollés (L10b-C5)", () => {
  it("les quatre blocs enregistrés recollés rendent la table unique, case pour case", async () => {
    const recorded = blocks();

    const cost = await matrix(recorded, IN_BLOCKS).build(FOUR);

    expect(recorded.calls).toHaveLength(4);
    const ids = [...FOUR.keys()];
    ids.forEach((from, row) => {
      ids.forEach((to, column) => {
        expect(cost.seconds(from, to)).toBe(OSRM_TABLE_FOUR.durations[row]?.[column]);
        expect(cost.meters(from, to)).toBe(OSRM_TABLE_FOUR.distances[row]?.[column]);
      });
    });
  });

  it("un bloc en échec fait échouer le tout — jamais une table à moitié routière", async () => {
    const failing = Object.keys(OSRM_TABLE_FOUR_BLOCKS)[2] ?? null;

    await expect(matrix(blocks(failing), IN_BLOCKS).build(FOUR)).rejects.toThrow(
      RoadRoutingUnavailableError,
    );
  });

  it(`découpe ${String(OSRM_MAX_TABLE_POINTS + 1)} points en blocs égaux — jamais un bloc d'un seul point`, async () => {
    const recorded = new RecordedFetch((_init, url) => {
      const sources = /sources=([\d;]+)/u.exec(url)?.[1]?.split(";").length ?? 0;
      const destinations = /destinations=([\d;]+)/u.exec(url)?.[1]?.split(";").length ?? 0;
      const square = (size: number, columns: number) =>
        Array.from({ length: size }, () => new Array<number>(columns).fill(1));
      return Promise.resolve(
        Response.json({
          code: "Ok",
          distances: square(sources, destinations),
          durations: square(sources, destinations),
        }),
      );
    });
    const many = new Map<string, GeoPoint>(
      Array.from({ length: OSRM_MAX_TABLE_POINTS + 1 }, (_, index) => [
        `p${String(index)}`,
        geoPoint(45.4, 6.6 + index / 10_000),
      ]),
    );

    await matrix(recorded).build(many);

    // 201 points : trois blocs de 67, donc 3 × 3 requêtes d'au plus 100 × 100.
    expect(recorded.calls).toHaveLength(9);
    for (const { url } of recorded.calls) {
      expect(/sources=([\d;]+)/u.exec(url)?.[1]?.split(";")).toHaveLength(67);
    }
  });
});

describe("plus de vol d'oiseau : refuse, en le nommant (L10b-C5)", () => {
  it.each([
    ["OSRM refuse la requête", json({ code: "InvalidQuery" }, 400)],
    ["le corps n'est pas du JSON", () => Promise.resolve(new Response("<html>", { status: 200 }))],
    ["`code` n'est pas Ok", json({ ...OSRM_TABLE_SAVOIE, code: "NoTable" })],
    ["la matrice n'a pas la bonne taille", json({ ...OSRM_TABLE_SAVOIE, durations: [[0]] })],
    ["un trajet est introuvable (case null)", json(OSRM_TABLE_UNREACHABLE)],
    ["la coupure réseau", () => Promise.reject(new TypeError("fetch failed"))],
  ])("quand %s — sans nouvel essai", async (_case, answer) => {
    const recorded = new RecordedFetch(answer);

    await expect(matrix(recorded).build(POINTS)).rejects.toThrow(
      "Le calcul routier se réveille et n'a pas encore répondu : réessayez dans une minute. Les tournées existantes ne sont pas touchées.",
    );
    expect(recorded.calls).toHaveLength(1);
  });

  /**
   * 2026-11-01 : un seul nouvel essai abandonnait pendant que l'instance
   * `basic` chargeait encore sa carte — « le calcul routier ne répond pas »
   * en production. Le réveil s'attend, dans un budget.
   */
  it("attend le réveil : rend la route après plusieurs 503, avec des pauses croissantes", async () => {
    let answered = 0;
    const recorded = new RecordedFetch(() => {
      answered += 1;
      return Promise.resolve(
        answered <= 3
          ? Response.json({ code: "LfdOsrmRefused" }, { status: 503 })
          : Response.json(OSRM_TABLE_SAVOIE),
      );
    });
    const pacing = new InstantPacing();

    const cost = await matrix(recorded, {}, pacing).build(POINTS);

    expect(recorded.calls).toHaveLength(4);
    expect(pacing.pauses).toEqual(OSRM_WAKE_PAUSES_MS.slice(0, 3));
    expect(cost.seconds("depot", "arc")).toBe(3052);
  });

  it("abandonne quand une pause et un essai de plus dépasseraient le budget", async () => {
    const recorded = new RecordedFetch(json({ code: "LfdOsrmRefused" }, 503));
    // 20 s par essai : 2 + 20 et 2 + 5 + 20 tiennent dans 30 s ; 2 + 5 + 10 + 20 non.
    const pacing = new InstantPacing(30_000);

    await expect(matrix(recorded, { timeoutMs: 20_000 }, pacing).build(POINTS)).rejects.toThrow(
      RoadRoutingUnavailableError,
    );
    expect(pacing.pauses).toEqual([2_000, 5_000]);
    expect(recorded.calls).toHaveLength(3);
  });

  it("le budget par défaut tient 90 s, et l'attente ne le dépasse jamais", async () => {
    const recorded = new RecordedFetch(json({ code: "LfdOsrmRefused" }, 503));
    const pacing = new InstantPacing();

    await expect(matrix(recorded, { timeoutMs: 20 }, pacing).build(POINTS)).rejects.toThrow(
      RoadRoutingUnavailableError,
    );
    expect(OSRM_WAKE_BUDGET_MS).toBe(90_000);
    expect(pacing.elapsedMs()).toBeLessThanOrEqual(OSRM_WAKE_BUDGET_MS);
    expect(pacing.pauses.length).toBeGreaterThan(3);
  });

  it("réessaie un délai dépassé comme un réveil, puis refuse au bout du budget", async () => {
    // Un `fetch` qui ne répond jamais, et ne cède qu'au signal : c'est bien
    // le délai de l'adaptateur qui coupe, pas le double.
    const silent = new RecordedFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const pacing = new InstantPacing(2_000 + 5_000 + 40);

    await expect(matrix(silent, { timeoutMs: 20 }, pacing).build(POINTS)).rejects.toThrow(
      RoadRoutingUnavailableError,
    );
    expect(silent.calls).toHaveLength(3);
  });

  it("sans ROUTE_PLANNER_URL, la matrice injectée refuse de la même façon", async () => {
    await expect(new DisabledDistanceMatrix().build()).rejects.toThrow(RoadRoutingUnavailableError);
  });
});
