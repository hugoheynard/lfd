import type { DeliverySimulationPayload } from "@lfd/contracts";

import {
  DepartureNotLocatedError,
  InvalidRoutingSettingError,
  RoadRoutingUnavailableError,
} from "../../../domain/errors/delivery-routing-errors.js";
import { StraightLineDistanceMatrix } from "../../../domain/ports/__tests__/road-routing-doubles.js";
import type { DistanceMatrix } from "../../../domain/ports/distance-matrix.js";
import type { GeoPoint } from "../../../domain/value-objects/geo-point.js";
import { DisabledDistanceMatrix } from "../../../infrastructure/disabled-road-routing.js";
import { FixedDeparture } from "../../commands/__tests__/routing-doubles.js";
import { SimulateDeliveryRoundsHandler } from "../simulate-delivery-rounds.handler.js";
import { SimulateDeliveryRoundsQuery } from "../simulate-delivery-rounds.query.js";

const LABO = { lat: 45.5646, lng: 5.9178 };
const VAL_D_ISERE = { lat: 45.4485, lng: 6.9823 };

const SETTINGS: DeliverySimulationPayload["settings"] = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: "06:00",
  maxRoundMinutes: 240,
  stopMinutes: 5,
  defaultMode: "insert",
  multiplePassages: true,
};

type Stop = DeliverySimulationPayload["stops"][number];

const stop = (id: string, lat: number, lng: number, window: Stop["window"] = null): Stop => ({
  id,
  label: `Chez ${id}`,
  gps: { lat, lng },
  window,
});

function handlerWith(options: {
  readonly configured?: GeoPoint | null;
  readonly matrix?: DistanceMatrix;
}) {
  const departure = new FixedDeparture(
    options.configured === undefined ? LABO : options.configured,
  );
  return new SimulateDeliveryRoundsHandler(
    departure.reader,
    departure,
    options.matrix ?? new StraightLineDistanceMatrix(),
  );
}

function scenario(overrides: Partial<DeliverySimulationPayload> = {}): SimulateDeliveryRoundsQuery {
  return new SimulateDeliveryRoundsQuery({
    stops: [stop("a", 45.6, 5.9), stop("b", 45.61, 5.91), stop("c", 45.5, 6.0)],
    vehicles: ["Kangoo", "Trafic"],
    settings: SETTINGS,
    departure: null,
    ...overrides,
  });
}

describe("SimulateDeliveryRoundsHandler — le simulateur (L9-C1 à C5)", () => {
  it("place tous les arrêts inventés dans des tournées neuves, sous leurs noms", async () => {
    const view = await handlerWith({}).execute(scenario());

    const placed = view.rounds.flatMap((round) => round.stops.map((s) => s.stopId)).sort();
    expect(placed).toEqual(["a", "b", "c"]);
    expect(view.overflow).toEqual([]);
    expect(view.rounds.every((round) => ["Kangoo", "Trafic"].includes(round.vehicleName))).toBe(
      true,
    );
    expect(view.rounds[0]?.stops[0]?.label).toMatch(/^Chez /u);
    expect(view.rounds[0]?.departureTime).toMatch(/^\d{2}:\d{2}$/u);
  });

  it("part du point de départ réglé quand le scénario n'en saisit pas", async () => {
    const view = await handlerWith({}).execute(scenario());

    expect(view.departure).toEqual({ label: "Laboratoire", ...LABO });
  });

  it("part du point saisi, même sans point réglé", async () => {
    const matrix = new StraightLineDistanceMatrix();
    const typed = { lat: 45.6, lng: 6.7 };

    const view = await handlerWith({ configured: null, matrix }).execute(
      scenario({ departure: typed }),
    );

    expect(view.departure).toEqual({ label: "Point de départ saisi", ...typed });
    expect(matrix.requested[0]?.get("depot")).toEqual(typed);
  });

  it("sans départ saisi ni réglé situé : le refus renvoie au réglage", async () => {
    await expect(handlerWith({ configured: null }).execute(scenario())).rejects.toBeInstanceOf(
      DepartureNotLocatedError,
    );
  });

  it("dit la fenêtre manquée, sans refuser l'arrêt", async () => {
    const view = await handlerWith({}).execute(
      scenario({ stops: [stop("loin", 45.4, 6.4, { start: null, end: "06:05" })] }),
    );

    const [placed] = view.rounds.flatMap((round) => round.stops);
    expect(placed?.window).toEqual({ start: null, end: "06:05" });
    expect(placed?.windowMissed).toBe(true);
  });

  it("met en débord l'arrêt qu'aucune tournée ne tient dans la durée maximale", async () => {
    const view = await handlerWith({}).execute(
      scenario({
        stops: [stop("proche", 45.57, 5.92), stop("val", VAL_D_ISERE.lat, VAL_D_ISERE.lng)],
        settings: { ...SETTINGS, maxRoundMinutes: 30 },
      }),
    );

    expect(view.overflow).toEqual([{ stopId: "val", label: "Chez val" }]);
  });

  it("annonce toujours la route — `estimate` est déprécié, et vaut `road` (L10b-C5)", async () => {
    expect((await handlerWith({}).execute(scenario())).estimate).toBe("road");
  });

  it("refuse sans calcul routier, comme « Proposer » : plus de vol d'oiseau (L10b-C5)", async () => {
    await expect(
      handlerWith({ matrix: new DisabledDistanceMatrix() }).execute(scenario()),
    ).rejects.toBeInstanceOf(RoadRoutingUnavailableError);
  });

  it("accepte des réglages sans détour ni vitesse, dépréciés (L10b-C5)", async () => {
    const { detourPercent: _detour, averageSpeedKmh: _speed, ...current } = SETTINGS;

    const view = await handlerWith({}).execute(scenario({ settings: current }));

    expect(view.rounds.length).toBeGreaterThan(0);
  });

  it("des identifiants d'arrêt répétés à l'écran restent deux arrêts distincts", async () => {
    const view = await handlerWith({}).execute(
      scenario({ stops: [stop("x", 45.6, 5.9), stop("x", 45.5, 6.0)] }),
    );

    expect(view.rounds.flatMap((round) => round.stops)).toHaveLength(2);
  });

  it("refuse un réglage hors bornes comme au lot 7", async () => {
    await expect(
      handlerWith({}).execute(scenario({ settings: { ...SETTINGS, averageSpeedKmh: 500 } })),
    ).rejects.toBeInstanceOf(InvalidRoutingSettingError);
  });
});
