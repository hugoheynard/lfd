import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import type { DeliveryOrderFacts, DeliveryStopPoint } from "../../channels/commerce/index.js";
import {
  GeocoderDisabledError,
  GeocoderUnavailableError,
} from "../../domain/errors/delivery-routing-errors.js";
import { addressKeyOf } from "../../domain/services/address-key.js";
import { LocateDeliveryStopsHandler } from "../commands/locate-delivery-stops.handler.js";
import {
  deliveryOn,
  InMemoryDeliveryRounds,
  LocatedDeliveryOrders,
} from "../commands/__tests__/round-doubles.js";
import {
  InMemoryGeocodeCache,
  RecordingGeocoder,
  RoundsReaderOver,
} from "../commands/__tests__/routing-doubles.js";
import { DeliveryStopsLocating } from "../delivery-stops-locating.js";

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

function point(orderId: string): DeliveryStopPoint {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    gps: null,
    address: address(`${orderId} rue du Pont`),
    window: null,
    stopMinutes: null,
    zoneId: null,
  };
}

/** Un géocodeur qu'on peut mettre en panne, puis réparer. */
class SwitchableGeocoder extends RecordingGeocoder {
  down = false;
  override geocode(requests: Parameters<RecordingGeocoder["geocode"]>[0]) {
    return this.down ? Promise.reject(new GeocoderUnavailableError()) : super.geocode(requests);
  }
}

function scene(
  orders: readonly DeliveryOrderFacts[],
  geocoder: RecordingGeocoder = new SwitchableGeocoder(() => ({ lat: 45.6, lng: 5.9 })),
) {
  const reader = new LocatedDeliveryOrders(
    orders,
    orders.map((order) => point(order.orderId)),
  );
  const cache = new InMemoryGeocodeCache();
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  const locate = new LocateDeliveryStopsHandler(
    reader,
    new RoundsReaderOver(new InMemoryDeliveryRounds()),
    cache,
    cache.writer,
    geocoder,
    new FixedClock(new Date(0)),
    new DirectUnitOfWork(),
  );
  const locating = new DeliveryStopsLocating(reader, locate, afterCommit, work);
  async function settle(): Promise<void> {
    await afterCommit.commit();
    await work.whenIdle();
  }
  return { locating, cache, geocoder, afterCommit, settle };
}

const located = (cache: InMemoryGeocodeCache, orderId: string) =>
  cache.find([addressKeyOf(address(`${orderId} rue du Pont`))]).then((found) => found.size === 1);

describe("DeliveryStopsLocating — situer l'adresse dès la commande (CA0)", () => {
  it("ne sort sur le réseau qu'APRÈS la validation, et situe l'adresse de la livraison", async () => {
    const { locating, cache, geocoder, afterCommit, settle } = scene([deliveryOn("o1", DAY)]);

    locating.orderPlaced("o1");
    expect(geocoder.asked).toHaveLength(0);

    await settle();
    expect(geocoder.asked).toHaveLength(1);
    expect(await located(cache, "o1")).toBe(true);
    afterCommit.discard();
  });

  it("une unité qui échoue ne géocode rien", async () => {
    const { locating, geocoder, afterCommit } = scene([deliveryOn("o1", DAY)]);

    locating.orderPlaced("o1");
    afterCommit.discard();
    await afterCommit.commit();

    expect(geocoder.asked).toHaveLength(0);
  });

  it("ignore un retrait, une annulée, une commande sans jour, une inconnue", async () => {
    const { locating, geocoder, settle } = scene([
      deliveryOn("p1", DAY, { delivery: false }),
      deliveryOn("x1", DAY, { status: "cancelled" }),
      deliveryOn("n1", DAY, { day: null }),
    ]);

    for (const id of ["p1", "x1", "n1", "absente"]) {
      locating.orderPlaced(id);
    }
    await settle();

    expect(geocoder.asked).toHaveLength(0);
  });

  it("géocodeur en panne : rien ne remonte, l'adresse reste non située, puis le passage suivant la rattrape", async () => {
    const geocoder = new SwitchableGeocoder(() => ({ lat: 45.6, lng: 5.9 }));
    geocoder.down = true;
    const { locating, cache, settle } = scene(
      [deliveryOn("o1", DAY), deliveryOn("o2", DAY)],
      geocoder,
    );

    locating.orderPlaced("o1");
    await settle();
    expect(await located(cache, "o1")).toBe(false);

    geocoder.down = false;
    locating.orderPlaced("o2");
    await settle();

    expect(await located(cache, "o1")).toBe(true);
    expect(await located(cache, "o2")).toBe(true);
  });

  it("l'arrêt du plan rattrape le jour entier, puis ne renvoie plus ce qui est situé", async () => {
    const geocoder = new SwitchableGeocoder(() => ({ lat: 45.6, lng: 5.9 }));
    geocoder.down = true;
    const { locating, cache, settle } = scene(
      [deliveryOn("o1", DAY), deliveryOn("o2", DAY)],
      geocoder,
    );
    locating.orderPlaced("o1");
    await settle();
    geocoder.down = false;

    locating.locateDaySoon(DAY);
    await settle();
    locating.locateDaySoon(DAY);
    await settle();

    expect(geocoder.asked.map((batch) => batch.length)).toEqual([2]);
    expect(await located(cache, "o1")).toBe(true);
    expect(await located(cache, "o2")).toBe(true);
  });

  it("géocodeur éteint (aucune URL) : rien ne remonte", async () => {
    const geocoder = new RecordingGeocoder(() => null, new GeocoderDisabledError());
    const { locating, cache, settle } = scene([deliveryOn("o1", DAY)], geocoder);

    locating.orderPlaced("o1");
    await settle();

    expect(cache.size).toBe(0);
  });
});
