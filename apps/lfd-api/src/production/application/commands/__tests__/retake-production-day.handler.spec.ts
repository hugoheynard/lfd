import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayNotClosedError } from "../../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RetakeProductionDayCommand } from "../retake-production-day.command.js";
import { RetakeProductionDayHandler } from "../retake-production-day.handler.js";
import { InMemoryBatches, RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { RecordingDurable } from "../../__tests__/handoff-doubles.js";

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
    dueAt: null,
    clientele: null,
    sheetDetails: null,
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

  constructor(
    private readonly current: ProductionDay,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  load(): Promise<ProductionDay> {
    this.trace.push("load");
    return Promise.resolve(this.current);
  }

  save(day: ProductionDay): Promise<void> {
    this.trace.push("save");
    this.saved = day;
    return Promise.resolve();
  }
}

/** Une journée arrêtée sur la seule commande `ord_1`, coche posée ou non. */
function closedDay(initials: string | null = null): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([order("ord_1", 30)], TIRAGE, null);
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
  batches: InMemoryBatches = new InMemoryBatches(),
  lock: RecordingDayLock = new RecordingDayLock(),
  durable: RecordingDurable = new RecordingDurable(),
): RetakeProductionDayHandler {
  return new RetakeProductionDayHandler(
    days,
    new Commerce(rows),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
    batches,
    lock,
    durable,
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
    ),
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

  it("🔴 matérialise la coche héritée AVANT d'absorber, et ne la recopie plus", async () => {
    // Plan des fournées, §5.3–5.4 : 30 cochés puis 30 → 42 ne doivent pas se
    // lire 42 sortis. La coche devient une fournée de 30 (même id que le
    // rattrapage), écrite avant la journée ; le compte recréé naît sans coche.
    const trace: string[] = [];
    const days = new Days(closedDay("MB"), trace);
    const batches = new InMemoryBatches(trace);
    const handler = subject(
      days,
      [order("ord_1", 30), order("ord_2", 12)],
      new RecordingPublisher(),
      batches,
      new RecordingDayLock(trace),
    );

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    const inherited = `backfill-${DAY}-PAI-SEI`;
    expect(trace).toEqual([`lock:${DAY}`, "load", `record:${inherited}`, "save"]);
    expect(batches.batches).toEqual([
      {
        id: inherited,
        sku: "PAI-SEI",
        quantity: 30,
        recorded: { at: TIRAGE, by: "staff-1", initials: "MB" },
        cancelled: null,
        returned: 0,
        pendingReturn: 0,
      },
    ]);
    expect(days.saved?.counts[0]).toMatchObject({ quantity: 42, done: null });
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

describe("RetakeProductionDayHandler — la liste à coliser (colisage, K1, §11 B2)", () => {
  it("publie une commande à coliser pour chaque commande ABSORBÉE, et elles seules", async () => {
    const durable = new RecordingDurable();
    const handler = subject(
      new Days(closedDay()),
      [order("ord_1", 30), order("ord_2", 12), order("ord_3", 4)],
      new RecordingPublisher(),
      new InMemoryBatches(),
      new RecordingDayLock(),
      durable,
    );

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    // Le fait du retirage (E3) part aussi : il a son propre test, plus bas.
    expect(
      durable.facts
        .filter((fact) => fact.type === "production.packing_list_drawn")
        .map((fact) => fact.key),
    ).toEqual([
      `production.packing_list_drawn:${DAY}:ord_2`,
      `production.packing_list_drawn:${DAY}:ord_3`,
    ]);
    // Datées du retirage — l'instant du tirage qui les a inscrites.
    expect(durable.facts[0]?.payload).toMatchObject({ drawnAt: NOW.toISOString() });
  });

  it("ne publie rien quand rien n'est absorbé", async () => {
    const durable = new RecordingDurable();
    const handler = subject(
      new Days(closedDay()),
      [order("ord_1", 30)],
      new RecordingPublisher(),
      new InMemoryBatches(),
      new RecordingDayLock(),
      durable,
    );

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    expect(durable.facts).toEqual([]);
  });
});

describe("RetakeProductionDayHandler — le fait du retirage (dossier-prod-du-jour.md, E3)", () => {
  it("publie `production.day_retaken` une fois, daté du retirage, avec le nombre absorbé", async () => {
    const durable = new RecordingDurable();
    const handler = subject(
      new Days(closedDay()),
      [order("ord_1", 30), order("ord_2", 12), order("ord_3", 4)],
      new RecordingPublisher(),
      new InMemoryBatches(),
      new RecordingDayLock(),
      durable,
    );

    await handler.execute(new RetakeProductionDayCommand(DAY, "staff-1"));

    const retaken = durable.facts.filter((fact) => fact.type === "production.day_retaken");
    expect(retaken).toEqual([
      {
        type: "production.day_retaken",
        key: `production.day_retaken:${DAY}:${NOW.toISOString()}`,
        payload: { serviceDay: DAY, retakenAt: NOW.toISOString(), absorbed: 2 },
      },
    ]);
  });
});
