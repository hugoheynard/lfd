import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay, type DoneMark } from "../../../domain/entities/production-day.js";
import { ProductionDayNotClosedError } from "../../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RetakeProductionDayCommand } from "../retake-production-day.command.js";
import { RetakeProductionDayHandler } from "../retake-production-day.handler.js";

/** Deux instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const TIRAGE = new Date("2026-09-13T04:20:00.000Z");
const NOW = new Date("2026-09-13T06:20:00.000Z");
const DAY = "2026-09-13";

function order(orderId: string, quantity: number): ProducibleOrder {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    lines: [{ sku: "PAI-SEI", productName: "Pain de seigle", quantity }],
  };
}

/** Le commerce doublé — il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Commerce extends DayOrdersReader {
  constructor(private readonly rows: readonly ProducibleOrder[]) {
    super();
  }

  producibleFor(): Promise<readonly ProducibleOrder[]> {
    return Promise.resolve(this.rows);
  }
}

class Days extends ProductionDayRepository {
  saved: ProductionDay | null = null;

  constructor(private readonly current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(day: ProductionDay): Promise<void> {
    this.saved = day;
    return Promise.resolve();
  }

  markPacked(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }

  markProduced(_day: ServiceDay, _sku: string, _mark: DoneMark | null): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  markPackedLine(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  recordContainerCount(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  stepContainerCount(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** Une journée arrêtée sur la seule commande `ord_1`, coche posée ou non. */
function closedDay(initials: string | null = null): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([order("ord_1", 30)], TIRAGE);
  if (initials !== null) {
    const marked = day.toSnapshot();
    return ProductionDay.fromSnapshot({
      ...marked,
      counts: marked.counts.map((item) => ({
        ...item,
        done: { at: TIRAGE, by: "staff-1", initials },
      })),
    });
  }
  return day;
}

function subject(
  days: Days,
  rows: readonly ProducibleOrder[],
  events: RecordingPublisher = new RecordingPublisher(),
): RetakeProductionDayHandler {
  return new RetakeProductionDayHandler(
    days,
    new Commerce(rows),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
}

describe("RetakeProductionDayHandler", () => {
  it("absorbe ce qui est arrivé depuis, écrit la journée et date le retirage", async () => {
    const days = new Days(closedDay());
    const events = new RecordingPublisher();
    const handler = subject(days, [order("ord_1", 30), order("ord_2", 12)], events);

    const retake = await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(retake).toEqual({ date: DAY, absorbed: 1, retakenAt: NOW.toISOString() });
    expect(days.saved).not.toBeNull();
    expect(days.saved?.counts[0]?.quantity).toBe(42);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_day.retaken",
        subjectType: "production_day",
        subjectId: DAY,
        payload: { subjectLabel: DAY, serviceDay: DAY, absorbed: 1 },
      },
    ]);
  });

  it("ne publie RIEN au commerce : le seul envoi est le fait journalisé", async () => {
    const events = new RecordingPublisher();
    const handler = subject(
      new Days(closedDay()),
      [order("ord_1", 30), order("ord_2", 12)],
      events,
    );

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(events.published).toEqual(events.traced);
  });

  it("🔴 GARDE la coche d'une ligne dont la quantité monte", async () => {
    // Un retirage ne décoche rien : le pain sorti du four à 5 h l'est toujours
    // quand la quantité passe de 30 à 42. C'est le cas que le bandeau nomme
    // AVANT de proposer le geste.
    const days = new Days(closedDay("MB"));
    const handler = subject(days, [order("ord_1", 30), order("ord_2", 12)]);

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(days.saved?.counts[0]).toMatchObject({ quantity: 42 });
    expect(days.saved?.counts[0]?.done).toMatchObject({ initials: "MB" });
  });

  it("n'écrit RIEN quand rien n'est arrivé, et rend le tirage affiché", async () => {
    // `absorbed: 0` est une information, pas une erreur — deux personnes qui
    // pressent le même bouton, ou un écran ouvert depuis un moment.
    const days = new Days(closedDay());
    const events = new RecordingPublisher();
    const handler = subject(days, [order("ord_1", 30)], events);

    const retake = await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(retake).toEqual({ date: DAY, absorbed: 0, retakenAt: TIRAGE.toISOString() });
    expect(days.saved).toBeNull();
    // Ni la journée, ni un fait : un retirage vide n'a rien changé.
    expect(events.published).toEqual([]);
  });

  it("refuse une journée qui n'est pas arrêtée : il n'y a pas de tirage à reprendre", async () => {
    const days = new Days(ProductionDay.open(ServiceDay.of(DAY)));
    const handler = subject(days, [order("ord_1", 30)]);

    await expect(
      handler.execute(new RetakeProductionDayCommand(DAY, "staff-1")),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);
    expect(days.saved).toBeNull();
  });
});
