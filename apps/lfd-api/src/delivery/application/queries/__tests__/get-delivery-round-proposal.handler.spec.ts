import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { DeliveryStopPoint } from "../../../channels/commerce/index.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import {
  DepartureNotLocatedError,
  RoadRoutingUnavailableError,
} from "../../../domain/errors/delivery-routing-errors.js";
import {
  StraightLineDistanceMatrix,
  StraightRouteGeometry,
} from "../../../domain/ports/__tests__/road-routing-doubles.js";
import { type CostFn, DistanceMatrix } from "../../../domain/ports/distance-matrix.js";
import type { GeoPoint } from "../../../domain/value-objects/geo-point.js";
import { OsrmDistanceMatrix } from "../../../infrastructure/osrm-distance-matrix.js";
import { addressKeyOf } from "../../../domain/services/address-key.js";
import { RoutingSettings } from "../../../domain/value-objects/routing-settings.js";
import {
  deliveryOn,
  FixedLoadedStops,
  InMemoryDeliveryRounds,
  LocatedDeliveryOrders,
  roundWith,
} from "../../commands/__tests__/round-doubles.js";
import {
  FixedDeparture,
  FixedFleet,
  InMemoryGeocodeCache,
  InMemoryRoutingSettings,
  RoundsReaderOver,
  vehicleView,
} from "../../commands/__tests__/routing-doubles.js";
import { GetDeliveryRoundProposalHandler } from "../get-delivery-round-proposal.handler.js";
import { GetDeliveryRoundProposalQuery } from "../get-delivery-round-proposal.query.js";

// Un jour comparé aux jours des commandes écrites ici — jamais à l'horloge.
const DAY = "2030-03-12";
const LABO = { lat: 45.5646, lng: 5.9178 };

const address = (ligne1: string) => ({
  label: "",
  ligne1,
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
});

function at(orderId: string, lat: number, lng: number): DeliveryStopPoint {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    gps: { lat, lng },
    address: address(orderId),
    window: null,
    stopMinutes: null,
  };
}

const POINTS: readonly DeliveryStopPoint[] = [
  at("o1", 45.6, 5.9),
  at("o2", 45.61, 5.91),
  at("o3", 45.5, 6.0),
  at("o4", 45.49, 6.01),
  { ...at("o5", 0, 0), gps: null, address: null },
  { ...at("o6", 0, 0), gps: null, address: address("jamais géocodée") },
  { ...at("o7", 0, 0), gps: null, address: address("en cache") },
  at("o8", 45.58, 5.92),
  at("o9", 45.62, 5.93),
  at("o10", 45.63, 5.94),
];

function departed(): DeliveryRound {
  const round = roundWith("r_gone", DAY, "v1", ["o8"]);
  return DeliveryRound.restore({ ...round.toSnapshot(), departedAt: new Date(0) });
}

/**
 * Une matrice « routière » : la ligne droite doublée, ALOURDIE au retour vers
 * le dépôt — asymétrique, comme une montée.
 */
class RoadDistanceMatrix extends DistanceMatrix {
  readonly built: number[] = [];

  async build(points: ReadonlyMap<string, GeoPoint>): Promise<CostFn> {
    this.built.push(points.size);
    const straight = await new StraightLineDistanceMatrix().build(points);
    const uphill = (toId: string): number => (toId === "depot" ? 2 : 1);
    return {
      meters: (from, to) => straight.meters(from, to) * uphill(to),
      seconds: (from, to) => straight.seconds(from, to) * uphill(to),
    };
  }
}

function scene(
  options: {
    readonly labo?: typeof LABO | null;
    readonly settings?: RoutingSettings;
    readonly matrix?: DistanceMatrix;
    readonly geometry?: StraightRouteGeometry;
    readonly points?: readonly DeliveryStopPoint[];
  } = {},
) {
  const rounds = new InMemoryDeliveryRounds(
    departed(),
    roundWith("r_loaded", DAY, "v2", ["o9"]),
    roundWith("r_open", DAY, "v1", ["o10"], 2),
  );
  const orders = new LocatedDeliveryOrders(
    POINTS.map((p) => deliveryOn(p.orderId, DAY)),
    options.points ?? POINTS,
  );
  const handler = new GetDeliveryRoundProposalHandler(
    new InMemoryRoutingSettings(options.settings ?? null),
    new FixedDeparture(null).reader,
    new FixedDeparture(options.labo === undefined ? LABO : options.labo),
    new FixedFleet([vehicleView("v1", "Kangoo"), vehicleView("v2", "Trafic")]),
    new RoundsReaderOver(rounds),
    orders,
    new FixedLoadedStops(["r_loaded_s1"]),
    new InMemoryGeocodeCache({ [addressKeyOf(address("en cache"))]: { lat: 45.55, lng: 5.95 } }),
    options.matrix ?? new StraightLineDistanceMatrix(),
    options.geometry ?? new StraightRouteGeometry(),
    new FixedClock(new Date(0)),
  );
  return { handler, rounds };
}

const placed = (view: Awaited<ReturnType<GetDeliveryRoundProposalHandler["execute"]>>) =>
  view.rounds.flatMap((round) => round.stops.map((stop) => stop.orderId)).sort();

describe("GetDeliveryRoundProposalHandler — « Proposer » (L7-C3 à C6)", () => {
  it("place les commandes à répartir situées — carnet ou cache —, et dit les autres", async () => {
    const { handler } = scene();

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

    expect(placed(view)).toEqual(["o1", "o2", "o3", "o4", "o7"]);
    expect(view.unlocated).toEqual([
      { orderId: "o5", reference: "CMD-o5", reason: "no_address" },
      { orderId: "o6", reference: "CMD-o6", reason: "not_geocoded" },
    ]);
    expect(view.rounds.every((round) => round.roundId === null)).toBe(true);
    expect(view.estimate).toBe("road"); // déprécié, toujours `road` (L10b-C5)
    expect(view.departurePoint.pickupAddressId).toBe("labo");
  });

  it("ne touche jamais une tournée partie ni chargée, et sans « tout recomposer » aucune autre", async () => {
    const { handler } = scene();

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

    expect(view.kept.map((kept) => [kept.roundId, kept.reason]).sort()).toEqual([
      ["r_gone", "departed"],
      ["r_loaded", "loaded"],
      ["r_open", "not_requested"],
    ]);
    expect(view.versions.map((version) => version.roundId).sort()).toEqual([
      "r_gone",
      "r_loaded",
      "r_open",
    ]);
  });

  it("« tout recomposer » reprend la tournée au dépôt sans sac chargé", async () => {
    const { handler } = scene();

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, ["v1"], true));

    expect(placed(view)).toContain("o10");
    expect(view.rounds.some((round) => round.roundId === "r_open")).toBe(true);
    expect(view.kept.map((kept) => kept.roundId).sort()).toEqual(["r_gone", "r_loaded"]);
  });

  it("n'écrit rien, et rend la même proposition deux fois (L7-C12)", async () => {
    const { handler, rounds } = scene();
    const query = new GetDeliveryRoundProposalQuery(DAY, null, true);

    const first = await handler.execute(query);
    const again = await handler.execute(query);

    expect(again).toEqual(first);
    expect(rounds.saved).toEqual([]);
  });

  it("sans point GPS au départ, refuse en renvoyant au réglage", async () => {
    const { handler } = scene({ labo: null });

    await expect(
      handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false)),
    ).rejects.toThrow(DepartureNotLocatedError);
    await expect(
      handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false)),
    ).rejects.toThrow("Point de départ");
  });

  describe("mode insert", () => {
    const insertOnly = RoutingSettings.define({
      ...RoutingSettings.DEFAULTS,
      defaultMode: "insert",
      multiplePassages: false,
    });

    it("insère dans les tournées au dépôt, sans toucher l'ordre placé à la main ni ouvrir de passage", async () => {
      const { handler, rounds } = scene({ settings: insertOnly });

      const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

      expect(view.mode).toBe("insert");
      expect(view.rounds.every((round) => round.roundId !== null)).toBe(true);
      expect(placed(view)).toEqual(["o1", "o10", "o2", "o3", "o4", "o7", "o9"].sort());
      expect(view.kept).toEqual([
        expect.objectContaining({ roundId: "r_gone", reason: "departed" }),
      ]);
      expect(view.versions).toHaveLength(3);
      expect(rounds.saved).toEqual([]);
    });

    it("le paramètre l'emporte sur le réglage", async () => {
      const { handler } = scene({ settings: insertOnly });

      const view = await handler.execute(
        new GetDeliveryRoundProposalQuery(DAY, null, false, "new_rounds"),
      );

      expect(view.mode).toBe("new_rounds");
      // Un seul passage permis, et chaque véhicule a déjà sa tournée : tout déborde.
      expect(view.rounds).toEqual([]);
      expect(view.overflow.map((order) => order.orderId).sort()).toEqual(
        ["o1", "o2", "o3", "o4", "o7"].sort(),
      );
    });
  });
});

describe("GetDeliveryRoundProposalHandler — par la route (lot 8, L8-C3)", () => {
  it("annonce `road` quand la matrice routière a répondu, en nouvelles tournées", async () => {
    const matrix = new RoadDistanceMatrix();
    const { handler } = scene({ matrix });

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

    expect(view.estimate).toBe("road");
    expect(placed(view)).toEqual(["o1", "o2", "o3", "o4", "o7"]);
    // UNE matrice par proposition : départ + les cinq arrêts situés + les deux
    // arrêts des tournées partie et chargée, chronométrées pour savoir quand
    // leurs camionnettes reviennent (L7t-C2).
    expect(matrix.built).toEqual([8]);
  });

  it("annonce `road` aussi en mode « insérer »", async () => {
    const { handler } = scene({ matrix: new RoadDistanceMatrix() });

    const view = await handler.execute(
      new GetDeliveryRoundProposalQuery(DAY, null, false, "insert"),
    );

    expect(view.mode).toBe("insert");
    expect(view.estimate).toBe("road");
  });

  /** L10b-C5 : le vol d'oiseau a disparu — un OSRM muet refuse, il ne retombe plus. */
  it("refuse quand OSRM ne répond pas, après un nouvel essai — plus de vol d'oiseau", async () => {
    let calls = 0;
    const silent = new OsrmDistanceMatrix("http://osrm.internal", {
      fetchFn: () => {
        calls += 1;
        return Promise.resolve(new Response("indisponible", { status: 503 }));
      },
    });
    const { handler } = scene({ matrix: silent });

    await expect(
      handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false)),
    ).rejects.toThrow(RoadRoutingUnavailableError);
    expect(calls).toBe(2);
  });
});

describe("GetDeliveryRoundProposalHandler — le tracé (L10b-C4)", () => {
  it("trace chaque tournée par la route : départ, arrêts dans l'ordre, retour", async () => {
    const geometry = new StraightRouteGeometry();
    const { handler } = scene({ geometry });

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

    expect(geometry.requested).toHaveLength(view.rounds.length);
    for (const round of view.rounds) {
      const line = round.geometry ?? [];
      expect(line[0]).toEqual([LABO.lng, LABO.lat]);
      expect(line[line.length - 1]).toEqual([LABO.lng, LABO.lat]);
      expect(line).toHaveLength(round.stops.length + 2);
    }
  });

  it("rend `geometry: null` quand la carte ne trace pas — la proposition, elle, tient", async () => {
    const { handler } = scene({ geometry: new StraightRouteGeometry(true) });

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

    expect(view.rounds.length).toBeGreaterThan(0);
    expect(view.rounds.every((round) => round.geometry === null)).toBe(true);
    expect(placed(view)).toEqual(["o1", "o2", "o3", "o4", "o7"]);
  });
});

describe("GetDeliveryRoundProposalHandler — les camionnettes occupées (lot 7 ter, L7t-C2)", () => {
  it("une camionnette chargée ou partie ne reçoit une tournée qu'à son retour, en 2ᵉ passage", async () => {
    const { handler } = scene();

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

    expect(view.rounds.length).toBeGreaterThan(0);
    expect(view.rounds.every((round) => round.passage >= 2)).toBe(true);
    // Les tournées gardées partent à 06:00 : rien de neuf ne part avec elles.
    expect(view.rounds.every((round) => round.departureTime > "06:00")).toBe(true);
    expect(view.kept.map(({ roundId, reason }) => [roundId, reason])).toEqual(
      expect.arrayContaining([
        ["r_gone", "departed"],
        ["r_loaded", "loaded"],
      ]),
    );
  });

  it("un arrêt non situé dans une tournée chargée écarte sa camionnette : on ne sait pas quand elle revient", async () => {
    const points = POINTS.map((point) =>
      point.orderId === "o9" ? { ...point, gps: null, address: null } : point,
    );
    const { handler } = scene({ points });

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

    expect(view.rounds.some((round) => round.vehicleId === "v2")).toBe(false);
    expect(view.rounds.some((round) => round.vehicleId === "v1")).toBe(true);
  });
});
