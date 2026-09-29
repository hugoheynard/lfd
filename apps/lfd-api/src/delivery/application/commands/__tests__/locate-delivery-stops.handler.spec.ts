import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { DeliveryStopPoint } from "../../../channels/commerce/index.js";
import { GeocoderUnavailableError } from "../../../domain/errors/delivery-routing-errors.js";
import { addressKeyOf } from "../../../domain/services/address-key.js";
import { LocateDeliveryStopsCommand } from "../locate-delivery-stops.command.js";
import {
  LocateDeliveryStopsHandler,
  MAX_GEOCODED_PER_GESTURE,
} from "../locate-delivery-stops.handler.js";
import {
  deliveryOn,
  InMemoryDeliveryRounds,
  LocatedDeliveryOrders,
  roundWith,
} from "./round-doubles.js";
import { InMemoryGeocodeCache, RecordingGeocoder, RoundsReaderOver } from "./routing-doubles.js";

// Un jour comparé aux jours des commandes écrites ici — jamais à l'horloge.
const DAY = "2030-03-12";

const address = (ligne1: string) => ({
  label: "",
  ligne1,
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
});

function point(orderId: string, overrides: Partial<DeliveryStopPoint> = {}): DeliveryStopPoint {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    gps: null,
    address: address(`${orderId} rue du Pont`),
    window: null,
    stopMinutes: null,
    ...overrides,
  };
}

function locate(
  points: readonly DeliveryStopPoint[],
  cache: InMemoryGeocodeCache,
  geocoder: RecordingGeocoder,
  rounds = new InMemoryDeliveryRounds(),
) {
  const orders = new LocatedDeliveryOrders(
    points.map((p) => deliveryOn(p.orderId, DAY)),
    points,
  );
  return new LocateDeliveryStopsHandler(
    orders,
    new RoundsReaderOver(rounds),
    cache,
    cache.writer,
    geocoder,
    new FixedClock(new Date(0)),
    new DirectUnitOfWork(),
  );
}

describe("LocateDeliveryStopsHandler — « Situer les arrêts » (L7-C9)", () => {
  it("n'envoie que ce qui manque : ni le carnet, ni le cache, ni deux fois la même adresse", async () => {
    const cache = new InMemoryGeocodeCache({
      [addressKeyOf(address("o2 rue du Pont"))]: { lat: 45.5, lng: 5.9 },
    });
    const geocoder = new RecordingGeocoder(() => ({ lat: 45.6, lng: 5.95 }));
    const points = [
      point("o1", { gps: { lat: 45.4, lng: 5.8 } }),
      point("o2"),
      point("o3"),
      point("o4", { address: address("o3 rue du Pont") }),
      point("o5", { address: null }),
    ];

    await locate(points, cache, geocoder).execute(new LocateDeliveryStopsCommand(DAY));

    expect(geocoder.asked).toHaveLength(1);
    expect(geocoder.asked[0]?.map((request) => request.street)).toEqual(["o3 rue du Pont"]);
    expect(cache.size).toBe(2);
  });

  it("situe aussi les commandes déjà composées dans une tournée du jour", async () => {
    const cache = new InMemoryGeocodeCache();
    const geocoder = new RecordingGeocoder(() => ({ lat: 45.6, lng: 5.95 }));
    const rounds = new InMemoryDeliveryRounds(roundWith("r1", DAY, "v1", ["o1"]));

    await locate([point("o1")], cache, geocoder, rounds).execute(
      new LocateDeliveryStopsCommand(DAY),
    );

    expect(geocoder.asked[0]).toHaveLength(1);
  });

  it("ne sort pas sur le réseau quand tout est déjà situé", async () => {
    const geocoder = new RecordingGeocoder(() => null);

    await locate(
      [point("o1", { gps: { lat: 45, lng: 6 } })],
      new InMemoryGeocodeCache(),
      geocoder,
    ).execute(new LocateDeliveryStopsCommand(DAY));

    expect(geocoder.asked).toEqual([]);
  });

  it(`plafonne un geste à ${String(MAX_GEOCODED_PER_GESTURE)} adresses`, async () => {
    const geocoder = new RecordingGeocoder(() => null);
    const many = Array.from({ length: MAX_GEOCODED_PER_GESTURE + 5 }, (_, i) =>
      point(`o${String(i).padStart(3, "0")}`),
    );

    await locate(many, new InMemoryGeocodeCache(), geocoder).execute(
      new LocateDeliveryStopsCommand(DAY),
    );

    expect(geocoder.asked[0]).toHaveLength(MAX_GEOCODED_PER_GESTURE);
  });

  it("BAN indisponible : refus nommé, rien d'écrit", async () => {
    const cache = new InMemoryGeocodeCache();
    const geocoder = new RecordingGeocoder(() => null, new GeocoderUnavailableError());

    await expect(
      locate([point("o1")], cache, geocoder).execute(new LocateDeliveryStopsCommand(DAY)),
    ).rejects.toThrow(GeocoderUnavailableError);
    expect(cache.size).toBe(0);
  });
});
