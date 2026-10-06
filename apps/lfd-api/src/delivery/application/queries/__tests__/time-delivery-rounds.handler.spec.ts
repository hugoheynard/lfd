import type { TimeDeliveryRoundsPayload } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { DeliveryStopPoint } from "../../../channels/commerce/index.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import {
  DeliveryRoundNotFoundError,
  OrderNotAssignableError,
  VehicleInactiveOnDayError,
} from "../../../domain/errors/delivery-round-errors.js";
import {
  InvalidProposalError,
  LockedRoundRecomposedError,
  RoadRoutingUnavailableError,
  RoutingVehicleNotFoundError,
  StopNotLocatedError,
  VehicleRoundsOverlapError,
} from "../../../domain/errors/delivery-routing-errors.js";
import {
  StraightLineDistanceMatrix,
  StraightRouteGeometry,
} from "../../../domain/ports/__tests__/road-routing-doubles.js";
import type { DistanceMatrix } from "../../../domain/ports/distance-matrix.js";
import { DisabledDistanceMatrix } from "../../../infrastructure/disabled-road-routing.js";
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
import { FixedBroughtBackOrders } from "../../commands/__tests__/brought-back-doubles.js";
import { TimeDeliveryRoundsHandler } from "../time-delivery-rounds.handler.js";
import { TimeDeliveryRoundsQuery } from "../time-delivery-rounds.query.js";

// Un jour comparé aux jours des commandes écrites ici — jamais à l'horloge.
const DAY = "2030-03-12";
const OTHER_DAY = "2030-03-13";
const LABO = { lat: 45.5646, lng: 5.9178 };

function at(orderId: string, lat: number, lng: number): DeliveryStopPoint {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    gps: { lat, lng },
    address: null,
    window: null,
    stopMinutes: null,
  };
}

const POINTS: readonly DeliveryStopPoint[] = [
  at("o1", 45.6, 5.9),
  at("o2", 45.61, 5.91),
  at("o3", 45.5, 6.0),
  { ...at("o4", 0, 0), gps: null },
  at("o5", 45.62, 5.93),
  at("o6", 45.63, 5.94),
  at("late", 45.4, 6.4),
  at("brought", 45.64, 5.95),
];

function scene(
  options: {
    readonly matrix?: DistanceMatrix;
    readonly departed?: boolean;
    readonly points?: readonly DeliveryStopPoint[];
  } = {},
) {
  const loadedRound = roundWith("r_loaded", DAY, "v2", ["o5"]);
  const open = roundWith("r_open", DAY, "v1", ["o6"]);
  const rounds = new InMemoryDeliveryRounds(
    options.departed === true
      ? DeliveryRound.restore({ ...open.toSnapshot(), departedAt: new Date(0) })
      : open,
    loadedRound,
  );
  const orders = new LocatedDeliveryOrders(
    [
      ...["o1", "o2", "o3", "o4", "o5", "o6", "late"].map((id) => deliveryOn(id, DAY)),
      deliveryOn("tomorrow", OTHER_DAY),
      // Rapportée (B3) d'un jour passé : replaçable n'importe quel jour (RL1).
      deliveryOn("brought", "2030-03-10"),
      deliveryOn("counter", DAY, { delivery: false }),
      deliveryOn("gone", DAY, { status: "cancelled" }),
    ],
    options.points ?? POINTS,
  );
  const geometry = new StraightRouteGeometry();
  const handler = new TimeDeliveryRoundsHandler(
    new InMemoryRoutingSettings(null),
    new FixedDeparture(null).reader,
    new FixedDeparture(LABO),
    new FixedFleet([
      vehicleView("v1", "Kangoo"),
      vehicleView("v2", "Trafic"),
      vehicleView("v3", "Ancien", new Date(0).toISOString()),
    ]),
    new RoundsReaderOver(rounds),
    orders,
    new FixedBroughtBackOrders([
      { orderId: "brought", broughtBackAt: new Date("2030-03-10T15:00:00.000Z") },
    ]),
    new FixedLoadedStops(["r_loaded_s1"]),
    new InMemoryGeocodeCache(),
    options.matrix ?? new StraightLineDistanceMatrix(),
    geometry,
    new FixedClock(new Date(0)),
  );
  return { handler, rounds, geometry };
}

type Rounds = TimeDeliveryRoundsPayload["rounds"];

const time = (handler: TimeDeliveryRoundsHandler, rounds: Rounds) =>
  handler.execute(new TimeDeliveryRoundsQuery({ day: DAY, rounds }));

describe("TimeDeliveryRoundsHandler — « Chronométrer » (L10b-C2)", () => {
  it("chronomètre la composition TELLE QUELLE, dans l'ordre donné — sans réordonner", async () => {
    const { handler } = scene();

    const forward = await time(handler, [
      { roundId: null, vehicleId: "v1", orderIds: ["o1", "o3", "o2"] },
    ]);

    expect(forward.day).toBe(DAY);
    expect(forward.rounds[0]?.stops.map((stop) => stop.orderId)).toEqual(["o1", "o3", "o2"]);
    expect(forward.rounds[0]?.departureTime).toBe("06:00");
    // Le zigzag o1 → o3 → o2 coûte plus que o1 → o2 → o3 : la preuve qu'on n'a pas réordonné.
    const straight = await time(handler, [
      { roundId: null, vehicleId: "v1", orderIds: ["o1", "o2", "o3"] },
    ]);
    expect(forward.rounds[0]?.meters).toBeGreaterThan(straight.rounds[0]?.meters ?? 0);
  });

  it("chronomètre une commande RAPPORTÉE d'un autre jour, comme une autre (RL1)", async () => {
    const { handler } = scene();

    const view = await time(handler, [
      { roundId: null, vehicleId: "v1", orderIds: ["o1", "brought"] },
    ]);

    expect(view.rounds[0]?.stops.map((stop) => stop.orderId)).toEqual(["o1", "brought"]);
  });

  it("compte à l'arrêt le temps de livraison de son adresse, sinon le réglage (L7b-C4)", async () => {
    const slow = POINTS.map((point) =>
      point.orderId === "o1" ? { ...point, stopMinutes: 45 } : point,
    );
    const rounds: Rounds = [{ roundId: null, vehicleId: "v1", orderIds: ["o1", "o2"] }];

    const usual = await time(scene().handler, rounds);
    const long = await time(scene({ points: slow }).handler, rounds);

    // 45 minutes chez o1 au lieu des 5 du réglage : o2 et le retour, 40 minutes plus tard.
    const minutes = (clock: string | undefined): number => {
      const [hours, mins] = (clock ?? "00:00").split(":").map(Number);
      return (hours ?? 0) * 60 + (mins ?? 0);
    };
    expect(minutes(long.rounds[0]?.returnTime) - minutes(usual.rounds[0]?.returnTime)).toBe(40);
  });

  it("le second passage d'un véhicule part à son retour du premier", async () => {
    const { handler } = scene();

    const view = await time(handler, [
      { roundId: null, vehicleId: "v1", orderIds: ["o1"] },
      { roundId: null, vehicleId: "v1", orderIds: ["o3"] },
    ]);

    expect(view.rounds.map((round) => round.passage)).toEqual([1, 2]);
    expect(view.rounds[1]?.departureTime).toBe(view.rounds[0]?.returnTime);
  });

  it("n'écrit rien : les tournées restent à leur version", async () => {
    const { handler, rounds } = scene();

    await time(handler, [{ roundId: "r_open", vehicleId: "v1", orderIds: ["o1", "o6"] }]);

    expect(rounds.stored("r_open")?.orderIds).toEqual(["o6"]);
    expect(rounds.stored("r_open")?.version).toBe(1);
  });

  it("trace chaque tournée, et rend `null` quand la carte ne trace pas", async () => {
    const { handler, geometry } = scene();

    const view = await time(handler, [{ roundId: null, vehicleId: "v1", orderIds: ["o1"] }]);

    expect(geometry.requested).toHaveLength(1);
    expect(view.rounds[0]?.geometry).toEqual([
      [LABO.lng, LABO.lat],
      [5.9, 45.6],
      [LABO.lng, LABO.lat],
    ]);
  });

  it("une tournée rangée APRÈS la tournée chargée de son véhicule part à son retour (L7t-C2)", async () => {
    const { handler } = scene();

    const view = await time(handler, [
      { roundId: "r_loaded", vehicleId: "v2", orderIds: ["o5"] },
      { roundId: null, vehicleId: "v2", orderIds: ["o1"] },
    ]);

    expect(view.rounds.map((round) => round.passage)).toEqual([1, 2]);
    expect(view.rounds[1]?.departureTime).toBe(view.rounds[0]?.returnTime);
  });

  it("le refus d'un chevauchement nomme la camionnette et le geste de sortie", async () => {
    await expect(
      time(scene().handler, [
        { roundId: null, vehicleId: "v2", orderIds: ["o1"] },
        { roundId: "r_loaded", vehicleId: "v2", orderIds: ["o5"] },
      ]),
    ).rejects.toThrow(
      "« Véhicule v2 » porte une tournée chargée : elle n'est libre qu'à son retour.",
    );
  });

  it("garde une tournée chargée telle quelle : même composition, même ordre", async () => {
    const { handler } = scene();

    const view = await time(handler, [{ roundId: "r_loaded", vehicleId: "v2", orderIds: ["o5"] }]);

    expect(view.rounds[0]?.roundId).toBe("r_loaded");
  });

  describe("l'alerte rouge : la place rend l'échéance intenable (CA5, §9)", () => {
    // o1 tient « avant 00:20 » livrée seule ; « late », à ~40 km, ne tient
    // pas « avant 00:10 » même seule — aucune place ne la sauverait.
    const deadlines = POINTS.map((point) => {
      if (point.orderId === "o1") {
        return { ...point, window: { start: null, end: "00:20" } };
      }
      return point.orderId === "late" ? { ...point, window: { start: null, end: "00:10" } } : point;
    });

    it("rouge pour une commande que sa place met en retard, alors que seule elle tiendrait", async () => {
      const view = await time(scene({ points: deadlines }).handler, [
        { roundId: null, vehicleId: "v1", orderIds: ["late", "o1", "o2"] },
      ]);

      const stops = view.rounds[0]?.stops ?? [];
      expect(stops.map((stop) => [stop.orderId, stop.windowMissed, stop.placementLate])).toEqual([
        ["late", true, false],
        ["o1", true, true],
        ["o2", false, false],
      ]);
    });

    it("rien de rouge quand la même commande est mise à une place qui la tient", async () => {
      const view = await time(scene({ points: deadlines }).handler, [
        { roundId: null, vehicleId: "v1", orderIds: ["o1", "o2"] },
      ]);

      expect(view.rounds[0]?.stops.some((stop) => stop.placementLate)).toBe(false);
    });
  });

  describe("refuse, en le nommant", () => {
    it.each<[string, Rounds, new (...args: never[]) => Error]>([
      [
        "une commande inconnue",
        [{ roundId: null, vehicleId: "v1", orderIds: ["nope"] }],
        OrderNotAssignableError,
      ],
      [
        "une commande d'un autre jour",
        [{ roundId: null, vehicleId: "v1", orderIds: ["tomorrow"] }],
        OrderNotAssignableError,
      ],
      [
        "une commande au comptoir",
        [{ roundId: null, vehicleId: "v1", orderIds: ["counter"] }],
        OrderNotAssignableError,
      ],
      [
        "une commande annulée",
        [{ roundId: null, vehicleId: "v1", orderIds: ["gone"] }],
        OrderNotAssignableError,
      ],
      [
        "une commande deux fois",
        [{ roundId: null, vehicleId: "v1", orderIds: ["o1", "o1"] }],
        InvalidProposalError,
      ],
      [
        "un véhicule inconnu",
        [{ roundId: null, vehicleId: "v9", orderIds: ["o1"] }],
        RoutingVehicleNotFoundError,
      ],
      [
        "un véhicule retiré",
        [{ roundId: null, vehicleId: "v3", orderIds: ["o1"] }],
        VehicleInactiveOnDayError,
      ],
      [
        "une tournée inconnue",
        [{ roundId: "r_nope", vehicleId: "v1", orderIds: ["o1"] }],
        DeliveryRoundNotFoundError,
      ],
      [
        "une tournée annoncée sur un autre véhicule",
        [{ roundId: "r_open", vehicleId: "v2", orderIds: ["o6"] }],
        InvalidProposalError,
      ],
      [
        "un arrêt ajouté à une tournée chargée",
        [{ roundId: "r_loaded", vehicleId: "v2", orderIds: ["o5", "o1"] }],
        LockedRoundRecomposedError,
      ],
      [
        "un arrêt sorti d'une tournée chargée",
        [{ roundId: null, vehicleId: "v1", orderIds: ["o5"] }],
        LockedRoundRecomposedError,
      ],
      [
        "une tournée de Trafic rangée AVANT sa tournée chargée (L7t-C2)",
        [
          { roundId: null, vehicleId: "v2", orderIds: ["o1"] },
          { roundId: "r_loaded", vehicleId: "v2", orderIds: ["o5"] },
        ],
        VehicleRoundsOverlapError,
      ],
      [
        "un arrêt non situé",
        [{ roundId: null, vehicleId: "v1", orderIds: ["o4"] }],
        StopNotLocatedError,
      ],
    ])("%s", async (_case, rounds, error) => {
      await expect(time(scene().handler, rounds)).rejects.toBeInstanceOf(error);
    });

    it("une tournée partie qu'on recompose", async () => {
      const { handler } = scene({ departed: true });

      await expect(
        time(handler, [{ roundId: "r_open", vehicleId: "v1", orderIds: ["o6", "o1"] }]),
      ).rejects.toBeInstanceOf(LockedRoundRecomposedError);
    });

    it("sans calcul routier — plus de vol d'oiseau (L10b-C5)", async () => {
      const { handler } = scene({ matrix: new DisabledDistanceMatrix() });

      await expect(
        time(handler, [{ roundId: null, vehicleId: "v1", orderIds: ["o1"] }]),
      ).rejects.toBeInstanceOf(RoadRoutingUnavailableError);
    });
  });
});
