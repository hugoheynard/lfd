import type { OrderDeliveryStopFact } from "../../../../../delivery/channels/commerce/index.js";
import { OrderDeliveryHistoryReader } from "../../../../../delivery/channels/commerce/index.js";
import type { OrderHandoverHistoryFact } from "../../../../../handover/channels/commerce/index.js";
import { OrderDeliveryDays } from "../../../domain/ports/order-delivery-days.js";
import { RecordOrderDeliveryDayCommand } from "../record-order-delivery-day.command.js";
import { RecordOrderDeliveryDayHandler } from "../record-order-delivery-day.handler.js";
import { EveryOrderHandedOver, NoHandovers, NoStops } from "./monthly-invoice-doubles.js";

/**
 * Le jour de livraison d'un bon, posé une fois (lot ZL) — l'orchestration,
 * ports doublés à la main. Les instants sont le SUJET : ils ne sont comparés
 * qu'au jour qu'ils donnent, aucune horloge n'est lue.
 */

/** La colonne `delivered_on` et son `where delivered_on IS NULL`. */
class MemoryDeliveryDays extends OrderDeliveryDays {
  readonly days = new Map<string, string>();
  readonly attempts: string[] = [];
  recordFirst(orderId: string, day: string): Promise<boolean> {
    this.attempts.push(`${orderId}:${day}`);
    if (this.days.has(orderId)) {
      return Promise.resolve(false);
    }
    this.days.set(orderId, day);
    return Promise.resolve(true);
  }
}

class FixedStops extends OrderDeliveryHistoryReader {
  stops: OrderDeliveryStopFact[] = [];
  ofOrders(): Promise<readonly OrderDeliveryStopFact[]> {
    return Promise.resolve(this.stops);
  }
}

/** Retiré à 00h30 le 1er novembre à Paris — le 31 octobre en UTC. */
const AFTER_MIDNIGHT = new Date("2026-10-31T23:30:00.000Z");

function stop(overrides: Partial<OrderDeliveryStopFact>): OrderDeliveryStopFact {
  return {
    orderId: "o1",
    serviceDay: "2026-10-31",
    placedAt: new Date("2026-10-30T10:00:00.000Z"),
    departedAt: new Date("2026-10-31T05:00:00.000Z"),
    closedAt: new Date("2026-10-31T12:00:00.000Z"),
    broughtBackAt: null,
    ...overrides,
  };
}

function atDoor(handedOverAt: Date): NoHandovers {
  const handovers = new NoHandovers();
  const fact: OrderHandoverHistoryFact = { orderId: "o1", handedOverAt, via: "scan", atDoor: true };
  handovers.facts.set("o1", fact);
  return handovers;
}

describe("RecordOrderDeliveryDay — la première remise date le bon", () => {
  it("au comptoir : le jour de PARIS du retrait, pas le jour UTC", async () => {
    const days = new MemoryDeliveryDays();
    const handler = new RecordOrderDeliveryDayHandler(
      new EveryOrderHandedOver(AFTER_MIDNIGHT),
      new NoStops(),
      days,
    );

    await handler.execute(new RecordOrderDeliveryDayCommand("o1"));

    expect(days.days.get("o1")).toBe("2026-11-01");
  });

  it("à la porte : le jour de la tournée qui l'a livré, la règle de la facture (`deliveredOnOf`)", async () => {
    const stops = new FixedStops();
    stops.stops = [stop({})];
    const days = new MemoryDeliveryDays();

    await new RecordOrderDeliveryDayHandler(atDoor(AFTER_MIDNIGHT), stops, days).execute(
      new RecordOrderDeliveryDayCommand("o1"),
    );

    expect(days.days.get("o1")).toBe("2026-10-31");
  });

  it("sans retrait attesté : rien n'est posé — le bon reste hors de toute facture", async () => {
    const days = new MemoryDeliveryDays();

    await new RecordOrderDeliveryDayHandler(new NoHandovers(), new NoStops(), days).execute(
      new RecordOrderDeliveryDayCommand("o1"),
    );

    expect(days.attempts).toEqual([]);
  });

  it("rejouée (fait livré deux fois, réannonce) : le jour posé ne bouge pas", async () => {
    const days = new MemoryDeliveryDays();
    const handler = new RecordOrderDeliveryDayHandler(
      new EveryOrderHandedOver(AFTER_MIDNIGHT),
      new NoStops(),
      days,
    );

    await handler.execute(new RecordOrderDeliveryDayCommand("o1"));
    await handler.execute(new RecordOrderDeliveryDayCommand("o1"));

    expect(days.days.get("o1")).toBe("2026-11-01");
    expect(days.attempts).toEqual(["o1:2026-11-01", "o1:2026-11-01"]);
  });

  it("un bac ramené puis relivré un autre jour ne déplace pas le jour déjà posé", async () => {
    const stops = new FixedStops();
    stops.stops = [stop({})];
    const days = new MemoryDeliveryDays();
    const handler = new RecordOrderDeliveryDayHandler(atDoor(AFTER_MIDNIGHT), stops, days);
    await handler.execute(new RecordOrderDeliveryDayCommand("o1"));

    // Les faits arrivent dans un autre ordre : la tournée du 31 est ramenée,
    // le bon repart le 3 novembre. La règle donnerait le 3 ; le 31 reste.
    stops.stops = [
      stop({ broughtBackAt: new Date("2026-10-31T13:00:00.000Z") }),
      stop({
        serviceDay: "2026-11-03",
        placedAt: new Date("2026-11-02T10:00:00.000Z"),
        departedAt: new Date("2026-11-03T05:00:00.000Z"),
        closedAt: new Date("2026-11-03T12:00:00.000Z"),
      }),
    ];
    await handler.execute(new RecordOrderDeliveryDayCommand("o1"));

    expect(days.attempts).toEqual(["o1:2026-10-31", "o1:2026-11-03"]);
    expect(days.days.get("o1")).toBe("2026-10-31");
  });
});
