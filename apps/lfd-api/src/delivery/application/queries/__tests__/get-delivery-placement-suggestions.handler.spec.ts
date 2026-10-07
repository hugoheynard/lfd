import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { DeliveryStopPoint } from "../../../channels/commerce/index.js";
import type { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import { StraightLineDistanceMatrix } from "../../../domain/ports/__tests__/road-routing-doubles.js";
import type { CostFn } from "../../../domain/ports/distance-matrix.js";
import type { GeoPoint } from "../../../domain/value-objects/geo-point.js";
import { FixedBroughtBackOrders } from "../../commands/__tests__/brought-back-doubles.js";
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
import { GetDeliveryPlacementSuggestionsHandler } from "../get-delivery-placement-suggestions.handler.js";
import { GetDeliveryPlacementSuggestionsQuery } from "../get-delivery-placement-suggestions.query.js";
import { measuredVehicleView, proposalCapacity } from "./capacity-doubles.js";

// Un jour comparé aux jours des commandes écrites ici — jamais à l'horloge.
const DAY = "2030-03-12";
const LABO = { lat: 45.5646, lng: 5.9178 };

function at(orderId: string, lat: number, lng: number): DeliveryStopPoint {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    gps: { lat, lng },
    address: null,
    window: null,
    stopMinutes: null,
    zoneId: null,
  };
}

const POINTS: readonly DeliveryStopPoint[] = [
  at("o1", 45.6, 5.9),
  { ...at("o5", 0, 0), gps: null },
  at("o9", 45.6, 5.91),
  at("o10", 45.62, 5.93),
];

/** La ligne droite, qui compte ses constructions : la matrice est la lecture qui coûte. */
class CountingMatrix extends StraightLineDistanceMatrix {
  built = 0;

  override build(points: ReadonlyMap<string, GeoPoint>): Promise<CostFn> {
    this.built += 1;
    return super.build(points);
  }
}

/**
 * Le Kangoo porte `r_open` (o10), le Trafic `r_loaded` (o9, un bac chargé,
 * la plus proche de o1) ;
 * o1 et o5 sont à répartir — o5 sans point.
 */
function scene(rounds?: readonly DeliveryRound[]) {
  const fleet = new FixedFleet([
    measuredVehicleView("v1", "Kangoo"),
    measuredVehicleView("v2", "Trafic"),
  ]);
  const stored = new InMemoryDeliveryRounds(
    ...(rounds ?? [
      roundWith("r_open", DAY, "v1", ["o10"]),
      roundWith("r_loaded", DAY, "v2", ["o9"]),
    ]),
  );
  const facts = POINTS.map((point) => deliveryOn(point.orderId, DAY));
  const matrix = new CountingMatrix();
  const handler = new GetDeliveryPlacementSuggestionsHandler(
    new InMemoryRoutingSettings(null),
    new FixedDeparture(null).reader,
    new FixedDeparture(LABO),
    fleet,
    new RoundsReaderOver(stored),
    new LocatedDeliveryOrders(facts, POINTS),
    new FixedLoadedStops(["r_loaded_s1"]),
    new InMemoryGeocodeCache({}),
    matrix,
    new FixedClock(new Date(0)),
    new FixedBroughtBackOrders(),
    new FixedOrderStates(
      facts.map((order) => ({ orderId: order.orderId, state: "open" as const, ready: true })),
    ),
    proposalCapacity(fleet),
  );
  const run = () => handler.execute(new GetDeliveryPlacementSuggestionsQuery(DAY));
  return { run, matrix, stored };
}

describe("GetDeliveryPlacementSuggestionsHandler — la place suggérée (CA7)", () => {
  it("suggère la tournée au dépôt la moins chère, même chargée, avec sa version, et dit les non situées", async () => {
    const { run } = scene();

    const view = await run();

    expect(view.day).toBe(DAY);
    expect(view.suggestions).toEqual([
      expect.objectContaining({
        orderId: "o1",
        reference: "CMD-o1",
        status: "suggested",
        roundId: "r_loaded",
        roundVersion: 1,
        vehicleId: "v2",
        vehicleName: "Véhicule v2",
        passage: 1,
        stopCount: 1,
      }),
      { orderId: "o5", reference: "CMD-o5", status: "none", reason: "unlocated" },
    ]);
  });

  /**
   * Régression de règle : la place suggérée écartait les tournées chargées,
   * alors qu'« Insérer » et l'affectation les admettent (Hugo, 2026-10-07 :
   * une tournée reçoit jusqu'à son départ, la place du véhicule limite).
   */
  it("vise aussi une tournée chargée : seule au dépôt, c'est elle qui reçoit", async () => {
    const { run, matrix } = scene([roundWith("r_loaded", DAY, "v2", ["o9"])]);

    const view = await run();

    expect(view.suggestions[0]).toEqual(
      expect.objectContaining({ orderId: "o1", status: "suggested", roundId: "r_loaded" }),
    );
    expect(matrix.built).toBe(1);
  });

  it("sans tournée enregistrée, rend vide sans construire de matrice : c'est « Proposer » qui compose", async () => {
    const { run, matrix } = scene([]);

    expect(await run()).toEqual({ day: DAY, suggestions: [] });
    expect(matrix.built).toBe(0);
  });

  it("ne construit qu'UNE matrice, et n'écrit rien", async () => {
    const { run, matrix, stored } = scene();

    await run();

    expect(matrix.built).toBe(1);
    expect(stored.saved).toEqual([]);
  });
});
