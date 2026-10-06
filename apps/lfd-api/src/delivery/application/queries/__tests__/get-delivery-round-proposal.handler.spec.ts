import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { DeliveryOrderFacts, DeliveryStopPoint } from "../../../channels/commerce/index.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import {
  NoActiveBinTypeError,
  NoMeasuredVehicleError,
} from "../../../domain/errors/delivery-composition-errors.js";
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
import { FixedBroughtBackOrders } from "../../commands/__tests__/brought-back-doubles.js";
import {
  FixedActiveBinTypes,
  FixedMeasuredVehicles,
} from "../../commands/__tests__/composition-doubles.js";
import { FixedOrderStates } from "../../commands/__tests__/doorstep-doubles.js";
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
} from "../../commands/__tests__/routing-doubles.js";
import { GetDeliveryRoundProposalHandler } from "../get-delivery-round-proposal.handler.js";
import { type DeliveryOrderLinesReader } from "../../../channels/commerce/index.js";
import {
  BIN_M,
  BreadForEveryOrder,
  measuredVehicleView,
  proposalCapacity,
} from "./capacity-doubles.js";
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
    readonly rounds?: readonly DeliveryRound[];
    readonly otherOrders?: readonly DeliveryOrderFacts[];
    readonly broughtBack?: FixedBroughtBackOrders;
    readonly measuredVehicleIds?: readonly string[];
    readonly activeBinTypeIds?: readonly string[];
    readonly lines?: DeliveryOrderLinesReader;
    readonly fleet?: FixedFleet;
  } = {},
) {
  // CA4 : deux véhicules mesurés, une commande = un bac (un pain, dix par bac).
  const fleet =
    options.fleet ??
    new FixedFleet([measuredVehicleView("v1", "Kangoo"), measuredVehicleView("v2", "Trafic")]);
  const rounds = new InMemoryDeliveryRounds(
    departed(),
    roundWith("r_loaded", DAY, "v2", ["o9"]),
    ...(options.rounds ?? [roundWith("r_open", DAY, "v1", ["o10"], 2)]),
  );
  const facts = [...POINTS.map((p) => deliveryOn(p.orderId, DAY)), ...(options.otherOrders ?? [])];
  const orders = new LocatedDeliveryOrders(facts, options.points ?? POINTS);
  const handler = new GetDeliveryRoundProposalHandler(
    new InMemoryRoutingSettings(options.settings ?? null),
    new FixedDeparture(null).reader,
    new FixedDeparture(options.labo === undefined ? LABO : options.labo),
    fleet,
    new RoundsReaderOver(rounds),
    orders,
    new FixedLoadedStops(["r_loaded_s1"]),
    new InMemoryGeocodeCache({ [addressKeyOf(address("en cache"))]: { lat: 45.55, lng: 5.95 } }),
    options.matrix ?? new StraightLineDistanceMatrix(),
    options.geometry ?? new StraightRouteGeometry(),
    new FixedClock(new Date(0)),
    options.broughtBack ?? new FixedBroughtBackOrders(),
    new FixedOrderStates(
      facts.map((order) => ({ orderId: order.orderId, state: "open" as const, ready: true })),
    ),
    new FixedMeasuredVehicles(options.measuredVehicleIds ?? ["v1"]),
    new FixedActiveBinTypes(options.activeBinTypeIds ?? ["bin_m"]),
    proposalCapacity(fleet, options.lines === undefined ? {} : { lines: options.lines }),
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

  it("« tout recomposer » reprend la tournée au dépôt sans bac chargé", async () => {
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

  it("🔴 sans véhicule mesuré, refuse avant tout calcul en renvoyant aux véhicules (CA-D3)", async () => {
    const { handler } = scene({ measuredVehicleIds: [], labo: null });

    // Le départ non situé n'est pas le refus rendu : le socle est le premier contrôle.
    await expect(
      handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false)),
    ).rejects.toThrow(NoMeasuredVehicleError);
  });

  it("🔴 sans type de bac en service, refuse en renvoyant aux bacs (CA-D3)", async () => {
    const { handler } = scene({ activeBinTypeIds: [] });

    await expect(
      handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false)),
    ).rejects.toThrow(NoActiveBinTypeError);
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
    const silent = new OsrmDistanceMatrix(
      { url: "http://localhost:5055", token: null },
      {
        fetchFn: () => {
          calls += 1;
          return Promise.resolve(new Response("indisponible", { status: 503 }));
        },
      },
    );
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

  describe("les commandes rapportées (decisions-par-defaut-2026-10-02, § 4)", () => {
    // Des jours comparés aux jours des commandes — jamais à l'horloge.
    const OTHER_DAY = "2030-03-10";
    const BROUGHT_AT = new Date("2030-03-10T15:00:00.000Z");
    const points = [...POINTS, at("o11", 45.59, 5.95), at("o12", 45.57, 5.96)];

    it("place une rapportée d'un autre jour, en tête des commandes à répartir", async () => {
      const { handler } = scene({
        points,
        otherOrders: [deliveryOn("o11", OTHER_DAY)],
        broughtBack: new FixedBroughtBackOrders([{ orderId: "o11", broughtBackAt: BROUGHT_AT }]),
      });

      const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

      expect(placed(view)).toEqual(["o1", "o11", "o2", "o3", "o4", "o7"]);
    });

    it("une tournée qui tient une rapportée d'un autre jour n'est pas « signalée » pour ça", async () => {
      const { handler } = scene({
        points,
        rounds: [roundWith("r_open", DAY, "v1", ["o10", "o11"], 2)],
        otherOrders: [deliveryOn("o11", OTHER_DAY)],
        broughtBack: new FixedBroughtBackOrders(
          [],
          [{ orderId: "o11", broughtBackAt: BROUGHT_AT }],
        ),
      });

      const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, ["v1"], true));

      expect(view.kept.map((kept) => kept.roundId).sort()).toEqual(["r_gone", "r_loaded"]);
      expect(placed(view)).toContain("o11");
    });

    it("une commande d'un autre jour JAMAIS rapportée garde la tournée telle quelle", async () => {
      const { handler } = scene({
        points,
        rounds: [roundWith("r_open", DAY, "v1", ["o10", "o12"], 2)],
        otherOrders: [deliveryOn("o12", OTHER_DAY)],
      });

      const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, ["v1"], true));

      expect(view.kept.find((kept) => kept.roundId === "r_open")?.reason).toBe("signaled_stop");
    });
  });
});

describe("GetDeliveryRoundProposalHandler — la place (CA4)", () => {
  /**
   * Régression : avant le 2026-10-06, une commande aux bacs inconnus restait
   * à répartir (`unknown_demand`) — sans contenances réglées, « Proposer » ne
   * plaçait presque rien avant le colisage.
   */
  it("une commande dont on ne connaît pas les bacs est placée, et nommée « place non vérifiée »", async () => {
    const { handler } = scene({ lines: new BreadForEveryOrder(new Map(), new Set(["o1", "o5"])) });

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

    expect(placed(view)).toEqual(["o1", "o2", "o3", "o4", "o7"]);
    expect(view.unfit).toEqual([]);
    // o5 n'est pas située, mais ses bacs sont inconnus aussi : l'écran la retrouvera si on la place.
    expect(view.unknownDemand).toEqual([
      { orderId: "o1", reference: "CMD-o1" },
      { orderId: "o5", reference: "CMD-o5" },
    ]);
  });

  it("une commande trop grosse pour toutes les caisses reste à répartir, raison « capacité »", async () => {
    // Une seule pile de Bacs M au sol (70 × 50 cm) : sept bacs (piles de six) ne tiennent pas.
    const small = { lengthCm: 70, widthCm: 50, heightCm: 140 };
    const fleet = new FixedFleet([
      measuredVehicleView("v1", "Vélo 1", small),
      measuredVehicleView("v2", "Vélo 2", small),
    ]);
    const { handler } = scene({ fleet, lines: new BreadForEveryOrder(new Map([["o1", 70]])) });

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

    expect(placed(view)).not.toContain("o1");
    expect(view.unfit).toEqual([{ orderId: "o1", reference: "CMD-o1", reason: "capacity" }]);
    expect(view.overflow).toEqual([]);
  });

  /** Régression : avant le 2026-10-06, la tournée était gardée (`unknown_demand_stop`). */
  it("« tout recomposer » reprend une tournée dont un arrêt n'a pas de bacs connus", async () => {
    const { handler } = scene({ lines: new BreadForEveryOrder(new Map(), new Set(["o10"])) });

    const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, ["v1"], true));

    expect(view.kept.map((kept) => kept.roundId)).not.toContain("r_open");
    expect(placed(view)).toContain("o10");
    expect(view.unknownDemand.map((order) => order.orderId)).toEqual(["o10"]);
  });

  it("Insérer : une tournée dont un arrêt n'a pas de bacs connus reste éligible", async () => {
    const { handler } = scene({ lines: new BreadForEveryOrder(new Map(), new Set(["o10"])) });

    const view = await handler.execute(
      new GetDeliveryRoundProposalQuery(DAY, ["v1"], false, "insert"),
    );

    // Avant le 2026-10-06, r_open était gardée (`unknown_demand_stop`) et rien n'y entrait.
    const open = view.rounds.find((round) => round.roundId === "r_open");
    expect(open?.stops.map((stop) => stop.orderId)).toEqual(expect.arrayContaining(["o10", "o1"]));
    expect(view.unknownDemand.map((order) => order.orderId)).toEqual(["o10"]);
  });

  describe("le contenant par défaut des réglages (2026-10-06)", () => {
    const withDefault = (count: number) =>
      RoutingSettings.define({
        ...RoutingSettings.DEFAULTS,
        defaultContainer: { binTypeId: BIN_M, count },
      });

    it("une commande sans ligne compte pour le défaut, nommée « par défaut » et plus « non vérifiée »", async () => {
      const { handler } = scene({
        settings: withDefault(1),
        lines: new BreadForEveryOrder(new Map(), new Set(["o1", "o5"])),
      });

      const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

      expect(placed(view)).toContain("o1");
      expect(view.unknownDemand).toEqual([]);
      expect(view.defaultDemand).toEqual([
        {
          orderId: "o1",
          reference: "CMD-o1",
          binTypeName: "Bac bin_m",
          count: 1,
          withEstimate: false,
        },
        {
          orderId: "o5",
          reference: "CMD-o5",
          binTypeName: "Bac bin_m",
          count: 1,
          withEstimate: false,
        },
      ]);
    });

    it("la place se contrôle sur le défaut : trop de bacs par défaut, et la commande reste à répartir", async () => {
      // Une seule pile de Bacs M au sol (70 × 50 cm, piles de six) : sept bacs ne tiennent pas.
      const small = { lengthCm: 70, widthCm: 50, heightCm: 140 };
      const fleet = new FixedFleet([
        measuredVehicleView("v1", "Vélo 1", small),
        measuredVehicleView("v2", "Vélo 2", small),
      ]);
      const { handler } = scene({
        fleet,
        settings: withDefault(7),
        lines: new BreadForEveryOrder(new Map(), new Set(["o1"])),
      });

      const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

      expect(placed(view)).not.toContain("o1");
      expect(view.unfit).toEqual([{ orderId: "o1", reference: "CMD-o1", reason: "capacity" }]);
      expect(view.unknownDemand).toEqual([]);
    });

    it("le défaut ne remplace jamais une estimation complète", async () => {
      const { handler } = scene({ settings: withDefault(1) });

      const view = await handler.execute(new GetDeliveryRoundProposalQuery(DAY, null, false));

      expect(view.defaultDemand).toEqual([]);
    });
  });
});
