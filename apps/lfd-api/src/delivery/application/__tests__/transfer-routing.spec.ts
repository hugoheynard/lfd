import { FixedClock } from "../../../platform/time/fixed-clock.js";
import type { DeliveryStopPoint, TransferSiteFacts } from "../../channels/commerce/index.js";
import { DeliveryRound } from "../../domain/entities/delivery-round.js";
import { StraightLineDistanceMatrix } from "../../domain/ports/__tests__/road-routing-doubles.js";
import { PlannedTiming } from "../../domain/value-objects/planned-timing.js";
import { RoutingSettings } from "../../domain/value-objects/routing-settings.js";
import {
  deliveryOn,
  InMemoryDeliveryRounds,
  LocatedDeliveryOrders,
  roundWith,
} from "../commands/__tests__/round-doubles.js";
import {
  FixedDeparture,
  InMemoryGeocodeCache,
  InMemoryRoutingSettings,
  RoundsReaderOver,
} from "../commands/__tests__/routing-doubles.js";
import { parisInstantOf } from "../planned-timing-of.js";
import { TransferRouting } from "../transfer-routing.js";

// Un jour comparé aux jours des commandes et des horaires écrits ici — jamais à l'horloge.
const DAY = "2030-03-12";
const HOUR = 3_600;
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

// « près » est à un quart d'heure du Labo, à deux pas du village ; « loin », à deux heures.
const POINTS = [at("near", 45.6, 5.92), at("near_2", 45.601, 5.921), at("far", 45.9, 6.4)];

/** Le village, servi par transfert : arrivé avant 7 h. */
const VILLAGE: TransferSiteFacts = {
  siteId: "village",
  label: "Le Village",
  gps: { lat: 45.605, lng: 5.925 },
  mode: "integrated",
  arrivalBy: "07:00",
};

/**
 * Une tournée chronométrée de `from` à `to` heures, et PARTIE : elle ne
 * reçoit plus rien, elle ne fait que tenir sa camionnette jusqu'à son retour.
 */
function departed(round: DeliveryRound, from: number, to: number): DeliveryRound {
  const departureAt = parisInstantOf(DAY, from * HOUR);
  const returnAt = parisInstantOf(DAY, to * HOUR);
  if (departureAt === null || returnAt === null) {
    throw new RangeError(`Heures illisibles pour ${DAY}.`);
  }
  return DeliveryRound.restore({
    ...round.toSnapshot(),
    plannedTiming: PlannedTiming.of({ departureAt, returnAt, meters: 0 }),
    departedAt: departureAt,
  });
}

function routing(...rounds: readonly DeliveryRound[]): TransferRouting {
  const orders = new LocatedDeliveryOrders(
    POINTS.map((point) => deliveryOn(point.orderId, DAY)),
    POINTS,
  );
  return new TransferRouting(
    new RoundsReaderOver(new InMemoryDeliveryRounds(...rounds)),
    orders,
    new InMemoryGeocodeCache(),
    new FixedDeparture(null).reader,
    new FixedDeparture(LABO),
    new InMemoryRoutingSettings(RoutingSettings.defaults()),
    new StraightLineDistanceMatrix(),
    new FixedClock(new Date(0)),
  );
}

describe("TransferRouting — où le transfert du jour entre-t-il ?", () => {
  /**
   * Régression (2026-10-14, la démo) : le second passage de Camionnette 1 était
   * chronométré comme s'il partait à l'heure réglée. Il recevait le transfert
   * du Village dû avant 7 h, alors qu'il ne part qu'au retour du premier.
   */
  it("ne place pas le transfert dans un second passage qui part après l'heure du village", async () => {
    const morning = departed(roundWith("r_morning", DAY, "v1", ["far"]), 6, 10.5);
    const afternoon = roundWith("r_afternoon", DAY, "v1", ["near"], 2);

    expect(await routing(morning, afternoon).placeFor(DAY, VILLAGE)).toBeNull();
  });

  it("le même passage, premier de sa camionnette, le reçoit à temps", async () => {
    const place = await routing(roundWith("r_alone", DAY, "v2", ["near"])).placeFor(DAY, VILLAGE);

    expect(place).toMatchObject({ roundId: "r_alone", version: 1 });
  });

  it("préfère une tournée du matin qui arrive à temps au second passage moins coûteux", async () => {
    const morning = departed(roundWith("r_morning", DAY, "v1", ["far"]), 6, 10.5);
    const afternoon = roundWith("r_afternoon", DAY, "v1", ["near"], 2);
    const other = roundWith("r_other", DAY, "v2", ["near_2"]);

    const place = await routing(morning, afternoon, other).placeFor(DAY, VILLAGE);

    expect(place?.roundId).toBe("r_other");
  });
});
