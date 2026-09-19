import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDayClosedEvent } from "../../../channels/commerce/production-day-closed.event.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayClosedJournalEvent } from "../../../domain/events/production-day.events.js";
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

  /** Non utilisé par la clôture : rejeter plutôt que rendre une valeur muette. */
  markPacked(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }

  /** Idem — la coche est un geste de la fiche d'atelier, pas de la clôture. */
  markProduced(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  /** Idem — le colisage est un geste du poste de bacs, pas de la clôture. */
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

/**
 * Une unité de travail qui sait si elle est OUVERTE — sans transactionner, comme
 * `DirectUnitOfWork`. C'est ce qui permet de dire où part chaque publication.
 */
class ObservedUnitOfWork extends UnitOfWork {
  open = false;

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.open = true;
    try {
      return await work();
    } finally {
      this.open = false;
    }
  }
}

/** Le publieur partagé, qui note en plus ce qui est parti DANS l'unité de travail. */
class Publisher extends RecordingPublisher {
  readonly insideUnitOfWork: object[] = [];

  constructor(private readonly uow: ObservedUnitOfWork) {
    super();
  }

  override publish(event: object): void {
    super.publish(event);
    if (this.uow.open) {
      this.insideUnitOfWork.push(event);
    }
  }

  override publishTraced(event: JournaledEvent): Promise<void> {
    if (this.uow.open) {
      this.insideUnitOfWork.push(event);
    }
    return super.publishTraced(event);
  }
}

function subject(day: ProductionDay, rows: readonly ProducibleOrder[]) {
  const days = new Days(day);
  const commerce = new Commerce(rows);
  const uow = new ObservedUnitOfWork();
  const events = new Publisher(uow);
  return {
    days,
    commerce,
    events,
    handler: new CloseProductionDayHandler(days, commerce, events, new FixedClock(NOW), uow),
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
      { sku: "VIE-001", productName: "Croissant", quantity: 80, done: null },
    ]);
    expect(events.published).toEqual([
      new ProductionDayClosedJournalEvent(DAY, 2),
      new ProductionDayClosedEvent(DAY, NOW, 2),
    ]);
  });

  it("JOURNALISE la clôture — la date de service et le nombre inscrit", async () => {
    const { handler, events } = subject(ProductionDay.open(ServiceDay.of(DAY)), [
      order(),
      order({ orderId: "ord_2" }),
    ]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_day.closed",
        subjectType: "production_day",
        subjectId: DAY,
        payload: { serviceDay: DAY, absorbed: 2 },
      },
    ]);
  });

  it("le fait part DANS l'unité de travail, l'événement du canal APRÈS elle", async () => {
    // Publié depuis la transaction, l'abonné du commerce hériterait de son
    // contexte et écrirait sur une transaction pas encore validée.
    const { handler, events } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(events.insideUnitOfWork).toEqual([new ProductionDayClosedJournalEvent(DAY, 1)]);
  });

  it("n'écrit RIEN chez le commerce — il l'apprend par l'événement", async () => {
    // Le handler ne connaît aucun port d'écriture du commerce, et c'est tout le
    // sujet du couplage minimal : chaque contexte n'écrit que ses tables. Ce
    // cas le tient par la SIGNATURE — aucun des ports du constructeur n'écrit
    // ailleurs que chez la production ou au journal.
    const { handler, commerce } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(commerce.asked).toBe(1);
  });

  it("REFUSE une journée sans commande, plutôt que d'arrêter le vide", async () => {
    const { handler, days, events } = subject(ProductionDay.open(ServiceDay.of(DAY)), []);

    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      ProductionDayEmptyError,
    );
    expect(days.saved).toBeNull();
    expect(events.published).toEqual([]);
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

  it("n'écrit AUCUN fait au journal — rien n'a changé", async () => {
    // Un second « arrêtée » dirait une heure et un auteur qui n'ont rien arrêté.
    const closed = ProductionDay.open(ServiceDay.of(DAY));
    closed.close([order()], EARLIER);
    const { handler, events } = subject(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(events.traced).toEqual([]);
    expect(events.insideUnitOfWork).toEqual([]);
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
