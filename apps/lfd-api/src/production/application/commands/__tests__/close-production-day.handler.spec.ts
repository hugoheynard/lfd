import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDayClosedEvent } from "../../../channels/commerce/production-day-closed.event.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayEmptyError } from "../../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { CloseProductionDayCommand } from "../close-production-day.command.js";
import { CloseProductionDayHandler } from "../close-production-day.handler.js";

const NOW = new Date("2026-09-07T18:00:00.000Z");
const EARLIER = new Date("2026-09-07T17:00:00.000Z");
const DAY = "2026-09-08";

function order(overrides: Partial<ProducibleOrder> = {}): ProducibleOrder {
  return {
    orderId: "ord_1",
    reference: "CMD-0001",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 40 }],
    ...overrides,
  };
}

/** Le commerce doublé — il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Commerce extends DayOrdersReader {
  asked = 0;

  constructor(private readonly rows: readonly ProducibleOrder[]) {
    super();
  }

  producibleFor(): Promise<readonly ProducibleOrder[]> {
    this.asked += 1;
    return Promise.resolve(this.rows);
  }
}

/** Le dépôt doublé : il retient ce qu'on lui sauve, comme une vraie base. */
class Days extends ProductionDayRepository {
  saved: ProductionDay | null = null;

  constructor(private current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(day: ProductionDay): Promise<void> {
    this.saved = day;
    this.current = day;
    return Promise.resolve();
  }
}

/** Le publieur, réduit à ce que le handler en appelle — il étend la classe. */
class Publisher extends DomainEventPublisher {
  readonly published: object[] = [];

  override publish(event: object): void {
    this.published.push(event);
  }

  override publishTraced(): Promise<void> {
    return Promise.resolve();
  }
}

function subject(day: ProductionDay, rows: readonly ProducibleOrder[]) {
  const days = new Days(day);
  const commerce = new Commerce(rows);
  const events = new Publisher();
  return {
    days,
    commerce,
    events,
    handler: new CloseProductionDayHandler(days, commerce, events, new FixedClock(NOW)),
  };
}

describe("clore une journée", () => {
  it("inscrit les commandes, arrête le compte, et PUBLIE le fait", async () => {
    const open = ProductionDay.open(ServiceDay.of(DAY));
    const { handler, days, events } = subject(open, [order(), order({ orderId: "ord_2" })]);

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure).toEqual({
      date: DAY,
      absorbed: 2,
      alreadyClosed: false,
      closedAt: NOW.toISOString(),
    });
    expect(days.saved?.counts).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 80 },
    ]);
    expect(events.published).toEqual([new ProductionDayClosedEvent(DAY, NOW, 2)]);
  });

  it("n'écrit RIEN chez le commerce — il l'apprend par l'événement", async () => {
    // Le handler ne connaît aucun port d'écriture du commerce, et c'est tout le
    // sujet du couplage minimal : chaque contexte n'écrit que ses tables. Ce
    // cas le tient par la SIGNATURE — le constructeur n'en prend que quatre, et
    // aucun n'écrit ailleurs.
    const { handler, commerce } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(commerce.asked).toBe(1);
  });

  it("REFUSE une journée sans commande, plutôt que d'arrêter le vide", async () => {
    const { handler, days } = subject(ProductionDay.open(ServiceDay.of(DAY)), []);

    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      ProductionDayEmptyError,
    );
    expect(days.saved).toBeNull();
  });

  it("refuse un jour qui n'est pas une date", async () => {
    const { handler } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await expect(handler.execute(new CloseProductionDayCommand("08/09/2026"))).rejects.toThrow();
  });
});

describe("réannoncer une journée déjà close", () => {
  it("REPUBLIE le fait sans rien recalculer", async () => {
    // C'est le rattrapage prévu : le bus vit en processus, donc un abonné qui a
    // échoué laisserait des commandes `placed` sur une journée close. Presser à
    // nouveau le bouton republie — et `absorbIntoPlan` étant idempotent, c'est
    // sans danger.
    const closed = ProductionDay.open(ServiceDay.of(DAY));
    closed.close([order()], EARLIER);
    const { handler, days, events } = subject(closed, [order(), order({ orderId: "ord_2" })]);

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.alreadyClosed).toBe(true);
    // L'instant du SNAPSHOT, jamais celui du rejeu : deux commandes absorbées
    // par la même clôture doivent porter la même heure.
    expect(closure.closedAt).toBe(EARLIER.toISOString());
    expect(closure.absorbed).toBe(1);
    expect(events.published).toEqual([new ProductionDayClosedEvent(DAY, EARLIER, 1)]);
    expect(days.saved).toBeNull();
  });

  it("ne demande MÊME PAS les commandes au commerce", async () => {
    // Une requête de moins, et surtout aucun risque de croire qu'on a lu ce
    // qu'on va écrire : une journée close ne relit pas ce qui a changé depuis.
    const closed = ProductionDay.open(ServiceDay.of(DAY));
    closed.close([order()], EARLIER);
    const { handler, commerce } = subject(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(commerce.asked).toBe(0);
  });
});
