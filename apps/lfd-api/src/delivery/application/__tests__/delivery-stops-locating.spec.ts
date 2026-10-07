import { DayComposer } from "../day-composer.js";
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

/** La composition du jour, enregistrée : quel jour, et après quoi. */
class RecordingComposer extends DayComposer {
  readonly days: string[] = [];

  composeDay(day: string): Promise<number> {
    this.days.push(day);
    return Promise.resolve(0);
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
  const composer = new RecordingComposer();
  const locating = new DeliveryStopsLocating(reader, locate, afterCommit, work, composer);
  async function settle(): Promise<void> {
    await afterCommit.commit();
    await work.whenIdle();
  }
  return { locating, cache, geocoder, afterCommit, settle, composer };
}

const located = (cache: InMemoryGeocodeCache, orderId: string) =>
  cache.find([addressKeyOf(address(`${orderId} rue du Pont`))]).then((found) => found.size === 1);

describe("DeliveryStopsLocating — situer l'adresse dès la commande (CA0)", () => {
  it("ne sort sur le réseau qu'APRÈS la validation, et situe l'adresse de la livraison", async () => {
    const { locating, cache, geocoder, afterCommit, settle } = scene([deliveryOn("o1", DAY)]);

    locating.locateOrderSoon("o1");
    expect(geocoder.asked).toHaveLength(0);

    await settle();
    expect(geocoder.asked).toHaveLength(1);
    expect(await located(cache, "o1")).toBe(true);
    afterCommit.discard();
  });

  it("une unité qui échoue ne géocode rien", async () => {
    const { locating, geocoder, afterCommit } = scene([deliveryOn("o1", DAY)]);

    locating.locateOrderSoon("o1");
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
      locating.locateOrderSoon(id);
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

    locating.locateOrderSoon("o1");
    await settle();
    expect(await located(cache, "o1")).toBe(false);

    geocoder.down = false;
    locating.locateOrderSoon("o2");
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
    locating.locateOrderSoon("o1");
    await settle();
    geocoder.down = false;

    locating.prepareDaySoon(DAY);
    await settle();
    locating.prepareDaySoon(DAY);
    await settle();

    expect(geocoder.asked.map((batch) => batch.length)).toEqual([2]);
    expect(await located(cache, "o1")).toBe(true);
    expect(await located(cache, "o2")).toBe(true);
  });

  /**
   * 2026-10-07 (Hugo : « proposer devrait être automatique à la clôture ») :
   * le jour se compose APRÈS la validation, et après que ses arrêts ont été
   * situés — jamais avant, sans quoi tout resterait à répartir. Une
   * commande placée ne compose rien.
   */
  it("prépare le jour : situe, puis compose — et jamais pour une commande seule", async () => {
    const { locating, geocoder, settle, composer } = scene([deliveryOn("o1", DAY)]);

    locating.locateOrderSoon("o1");
    await settle();
    expect(composer.days).toEqual([]);

    locating.prepareDaySoon(DAY);
    expect(composer.days).toEqual([]);
    await settle();

    expect(geocoder.asked).toHaveLength(1);
    expect(composer.days).toEqual([DAY]);
  });

  it("géocodeur éteint : le jour se compose quand même, sur les points du carnet", async () => {
    const geocoder = new RecordingGeocoder(() => null, new GeocoderDisabledError());
    const { locating, settle, composer } = scene([deliveryOn("o1", DAY)], geocoder);

    locating.prepareDaySoon(DAY);
    await settle();

    expect(composer.days).toEqual([DAY]);
  });

  it("géocodeur éteint (aucune URL) : rien ne remonte", async () => {
    const geocoder = new RecordingGeocoder(() => null, new GeocoderDisabledError());
    const { locating, cache, settle } = scene([deliveryOn("o1", DAY)], geocoder);

    locating.locateOrderSoon("o1");
    await settle();

    expect(cache.size).toBe(0);
  });
});
