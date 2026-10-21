import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { PendingSettlementSweeper } from "../../../channels/commerce/pending-settlement.sweeper.js";
import { ProductionDayClosedEvent } from "../../../channels/commerce/production-day-closed.event.js";
import { PackingListDrawnEvent } from "../../../channels/packing/packing-list-drawn.event.js";
import {
  PRODUCTION_RESUPPLY_LIST_DRAWN,
  ResupplyListDrawnEvent,
} from "../../../channels/packing/resupply-list-drawn.event.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayClosedJournalEvent } from "../../../domain/events/production-day.events.js";
import {
  PlanClosedBeforeOrderCutoffError,
  ProductionDayEmptyError,
} from "../../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import {
  CutoffRules,
  DayResupplies,
  ResupplyTime,
  stopRulesOf,
} from "../../__tests__/settings-doubles.js";
import { InMemoryWithdrawals } from "../../__tests__/withdrawal-doubles.js";
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
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 40 }],
    ...overrides,
  };
}

/** Le journal des gestes demandés au commerce, dans l'ordre où ils arrivent. */
type CommerceCall = "sweep" | "producibleFor";

/** Le commerce doublé — il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Commerce extends DayOrdersReader {
  asked = 0;

  constructor(
    private readonly rows: readonly ProducibleOrder[],
    private readonly calls: CommerceCall[],
  ) {
    super();
  }

  producibleFor(): Promise<readonly ProducibleOrder[]> {
    this.asked += 1;
    this.calls.push("producibleFor");
    return Promise.resolve(this.rows);
  }
}

/** Le balayage doublé : il note les jours demandés, et sa place dans la séquence. */
class Sweeper extends PendingSettlementSweeper {
  readonly days: string[] = [];

  constructor(private readonly calls: CommerceCall[]) {
    super();
  }

  sweep(day: ServiceDay): Promise<void> {
    this.days.push(day.value);
    this.calls.push("sweep");
    return Promise.resolve();
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

/** Le fait durable de référence, tel que le contrat l'écrit. */
function closedFact(
  orderIds: readonly string[],
  closedAt: Date,
  reannouncedAt: Date | null = null,
) {
  return new ProductionDayClosedEvent(DAY, closedAt, orderIds, reannouncedAt).durableFact();
}

/** La commande à coliser de référence (colisage, K1) — un fait par commande. */
function listFact(source: ProducibleOrder, drawnAt: Date) {
  return new PackingListDrawnEvent(DAY, drawnAt, {
    orderId: source.orderId,
    reference: source.reference,
    customerLabel: source.customerLabel,
    fulfillmentMethod: source.fulfillmentMethod,
    dueAt: source.dueAt,
    clientele: null,
    siteId: source.siteId,
    lines: source.lines,
  }).durableFact();
}

/** La boîte d'envoi doublée : elle refuse hors unité de travail, comme le vrai port. */
class Durable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  constructor(private readonly uow: ObservedUnitOfWork) {
    super();
  }

  publish(fact: DurableFact): Promise<void> {
    if (!this.uow.open) {
      return Promise.reject(new Error("fait durable hors unité de travail"));
    }
    this.facts.push(fact);
    return Promise.resolve();
  }
}

function subject(
  day: ProductionDay,
  rows: readonly ProducibleOrder[],
  withdrawals: InMemoryWithdrawals = new InMemoryWithdrawals(),
  cutoffs: CutoffRules = new CutoffRules(),
  resupplies: DayResupplies = new DayResupplies(),
  resupplyTime: ResupplyTime = new ResupplyTime(),
) {
  const days = new Days(day);
  const calls: CommerceCall[] = [];
  const commerce = new Commerce(rows, calls);
  const sweeper = new Sweeper(calls);
  const uow = new ObservedUnitOfWork();
  const events = new Publisher(uow);
  const durable = new Durable(uow);
  return {
    durable,
    days,
    withdrawals,
    commerce,
    sweeper,
    calls,
    events,
    handler: new CloseProductionDayHandler(
      days,
      commerce,
      sweeper,
      events,
      new FixedClock(NOW),
      uow,
      durable,
      new RecordingDayLock(),
      new FixedStaffAuthorDirectory(
        authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
      ),
      withdrawals,
      stopRulesOf(cutoffs, resupplyTime),
      resupplies,
    ),
  };
}

/**
 * Pas d'arrêt avant l'heure limite générale (Hugo, 2026-10-21 —
 * `limites-de-commande/plan-une-seule-heure.md` §4 Q1, §5). `NOW` est 20:00 à
 * Paris, la veille de `DAY`.
 */
describe("l'arrêt avant l'heure limite générale", () => {
  const open = () => ProductionDay.open(ServiceDay.of(DAY));

  it("est refusé avant la fin du rattrapage, sans balayer ni écrire", async () => {
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "19:45", graceMinutes: 30 }]);
    const { handler, days, calls, durable } = subject(open(), [order()], undefined, cutoffs);

    const refusal = handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    await expect(refusal).rejects.toThrow(PlanClosedBeforeOrderCutoffError);
    await expect(refusal).rejects.toThrow(
      "Le plan du mardi 8 septembre s'arrête tout seul à l'heure limite générale, rattrapage compris : le lundi 7 septembre à 20:15.",
    );
    await expect(refusal).rejects.toThrow("Réglages › Commandes › Heure limite");
    expect(calls).toEqual([]);
    expect(days.saved).toBeNull();
    expect(durable.facts).toEqual([]);
  });

  it("passe à la fin du rattrapage pile", async () => {
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "19:30", graceMinutes: 30 }]);
    const { handler } = subject(open(), [order()], undefined, cutoffs);

    const closure = await handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    expect(closure.alreadyClosed).toBe(false);
  });

  it("passe sans heure limite posée : rien ne l'arrête seul", async () => {
    const { handler } = subject(open(), [order()]);

    expect((await handler.execute(new CloseProductionDayCommand(DAY))).alreadyClosed).toBe(false);
  });

  /** « Un arrêt déjà fait reste tel quel » : sa réannonce n'est pas un nouvel arrêt. */
  it("laisse réannoncer une journée déjà arrêtée, même avant l'heure limite", async () => {
    const closed = open();
    closed.close([order()], new Set<string>(), EARLIER, null);
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "23:00", graceMinutes: 0 }]);
    const { handler } = subject(closed, [order()], undefined, cutoffs);

    expect((await handler.execute(new CloseProductionDayCommand(DAY))).alreadyClosed).toBe(true);
  });
});

describe("clore une journée", () => {
  it("inscrit les commandes, arrête le compte, et PUBLIE le fait", async () => {
    const open = ProductionDay.open(ServiceDay.of(DAY));
    const { handler, days, events, durable } = subject(open, [
      order(),
      order({ orderId: "ord_2" }),
    ]);

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
    expect(events.published).toEqual([new ProductionDayClosedJournalEvent(DAY, 2)]);
    // Puis la liste à coliser, une commande par fait (colisage, K1, §11 B1).
    expect(durable.facts).toEqual([
      closedFact(["ord_1", "ord_2"], NOW),
      listFact(order(), NOW),
      listFact(order({ orderId: "ord_2" }), NOW),
    ]);
  });

  it("🔴 écarte une commande retirée par l'annulation staff, lue sous le verrou (C3.4)", async () => {
    const withdrawals = new InMemoryWithdrawals();
    withdrawals.rows.set("ord_2", { day: DAY, at: NOW });
    const { handler, days, durable } = subject(
      ProductionDay.open(ServiceDay.of(DAY)),
      [order(), order({ orderId: "ord_2" })],
      withdrawals,
    );

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.absorbed).toBe(1);
    expect(days.saved?.orders.map((frozen) => frozen.orderId)).toEqual(["ord_1"]);
    expect(durable.facts[0]).toEqual(closedFact(["ord_1"], NOW));
  });

  it("la liste à coliser porte l'ÉCHÉANCE de chaque commande (colisage, §13)", async () => {
    const { handler, durable } = subject(ProductionDay.open(ServiceDay.of(DAY)), [
      order({ dueAt: "07:30" }),
    ]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(durable.facts[1]).toMatchObject({
      type: "production.packing_list_drawn",
      key: `production.packing_list_drawn:${DAY}:ord_1`,
      payload: { order: { dueAt: "07:30" } },
    });
  });

  it("dit au journal un arrêt AUTOMATIQUE — `automatic: true` (lot A2, S7)", async () => {
    const { handler, events } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY, "automatic"));

    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      { subjectLabel: DAY, serviceDay: DAY, absorbed: 1, automatic: true },
    ]);
  });

  it("FIGE qui a arrêté, nom compris, à l'arrêt manuel", async () => {
    const { handler, days } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    expect(days.saved?.closedBy).toEqual({
      kind: "staff",
      staffUserId: "staff-1",
      name: "Marie Dupont",
    });
  });

  it("FIGE « automatiquement » à l'arrêt automatique, et rien quand l'auteur est inconnu", async () => {
    const auto = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);
    await auto.handler.execute(new CloseProductionDayCommand(DAY, "automatic"));
    expect(auto.days.saved?.closedBy).toEqual({ kind: "automatic" });

    const anonymous = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);
    await anonymous.handler.execute(new CloseProductionDayCommand(DAY));
    expect(anonymous.days.saved?.closedBy).toBeNull();
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
        payload: { subjectLabel: DAY, serviceDay: DAY, absorbed: 2 },
      },
    ]);
  });

  it("journal ET boîte d'envoi partent DANS l'unité de travail de la clôture", async () => {
    // Le fait durable tombe avec la clôture, ou n'existe pas : le double refuse
    // hors unité de travail, comme le vrai port. Plus rien ne part en mémoire.
    const { handler, events, durable } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(events.insideUnitOfWork).toEqual([new ProductionDayClosedJournalEvent(DAY, 1)]);
    // La clôture et la liste à coliser : le double refuse hors unité de travail.
    expect(durable.facts).toHaveLength(2);
  });

  it("la clé de la clôture est déterministe : la journée et l'instant d'arrêt", async () => {
    const { handler, durable } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(durable.facts[0]).toMatchObject({
      type: "production.day_closed",
      key: `production.day_closed:${DAY}:${NOW.toISOString()}`,
      payload: { serviceDay: DAY, closedAt: NOW.toISOString(), orderIds: ["ord_1"] },
    });
  });

  it("ne confirme RIEN chez le commerce — il l'apprend par l'événement", async () => {
    // `confirmed` reste un fait du commerce, tiré de l'événement par son
    // abonné. Le seul geste que la clôture DEMANDE au commerce est le
    // balayage des règlements en vol, par le port que le fournil déclare
    // (plan d'abandon, B1, 2026-09-26) — et c'est le commerce qui l'écrit.
    const { handler, commerce } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(commerce.asked).toBe(1);
  });

  it("BALAIE les règlements en vol AVANT de compter (Q1)", async () => {
    // Compter d'abord laisserait une journée sans carte payée vide, donc
    // inarrêtable, et ses règlements en vol vivants pour toujours (§4).
    const { handler, sweeper, calls } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(sweeper.days).toEqual([DAY]);
    expect(calls).toEqual(["sweep", "producibleFor"]);
  });

  it("refuse la journée vide APRÈS avoir balayé : personne n'a payé", async () => {
    const { handler, sweeper } = subject(ProductionDay.open(ServiceDay.of(DAY)), []);

    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      ProductionDayEmptyError,
    );
    expect(sweeper.days).toEqual([DAY]);
  });

  it("REFUSE une journée sans commande, plutôt que d'arrêter le vide", async () => {
    const { handler, days, events, durable } = subject(ProductionDay.open(ServiceDay.of(DAY)), []);

    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      ProductionDayEmptyError,
    );
    expect(days.saved).toBeNull();
    expect(events.published).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("refuse un jour qui n'est pas une date", async () => {
    const { handler } = subject(ProductionDay.open(ServiceDay.of(DAY)), [order()]);

    await expect(handler.execute(new CloseProductionDayCommand("08/09/2026"))).rejects.toThrow();
  });
});

describe("réannoncer une journée déjà close", () => {
  it("BALAIE quand même : une commande passée après la clôture meurt aussi (S4)", async () => {
    const closed = ProductionDay.open(ServiceDay.of(DAY));
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, sweeper } = subject(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(sweeper.days).toEqual([DAY]);
  });

  it("REPUBLIE le fait sans rien recalculer — l'instantané, pas le commerce d'aujourd'hui", async () => {
    // Le filet humain : presser à nouveau le bouton republie un fait durable.
    // Il porte les commandes de l'INSTANTANÉ (ord_1), jamais `ord_2` arrivée
    // après l'arrêt : le commerce n'absorbe que ce que le fournil a compté.
    const closed = ProductionDay.open(ServiceDay.of(DAY));
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, days, events, durable } = subject(closed, [
      order(),
      order({ orderId: "ord_2" }),
    ]);

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.alreadyClosed).toBe(true);
    // L'instant du SNAPSHOT, jamais celui du rejeu : deux commandes absorbées
    // par la même clôture doivent porter la même heure.
    expect(closure.closedAt).toBe(EARLIER.toISOString());
    expect(closure.absorbed).toBe(1);
    expect(events.published).toEqual([]);
    // La liste est republiée sous la MÊME clé par commande, et datée du tirage
    // d'origine : la boîte d'envoi l'absorbe (colisage, §13, MINEURS).
    expect(durable.facts).toEqual([
      closedFact(["ord_1"], EARLIER, NOW),
      listFact(order(), EARLIER),
    ]);
    expect(days.saved).toBeNull();
  });

  it("une réannonce est un fait NEUF : sa clé porte l'instant du geste", async () => {
    // Dédupliquée sur la clé de la clôture, elle ne ferait rien — un bouton de
    // réparation sans effet. Cf. `ProductionDayClosedEvent`, « La clé ».
    const closed = ProductionDay.open(ServiceDay.of(DAY));
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, durable } = subject(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(durable.facts[0]?.key).toBe(
      `production.day_closed:${DAY}:${EARLIER.toISOString()}:reannounced:${NOW.toISOString()}`,
    );
  });

  it("n'écrit AUCUN fait au journal — rien n'a changé", async () => {
    // Un second « arrêtée » dirait une heure et un auteur qui n'ont rien arrêté.
    const closed = ProductionDay.open(ServiceDay.of(DAY));
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, events } = subject(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(events.traced).toEqual([]);
    expect(events.insideUnitOfWork).toEqual([]);
  });

  it("ne demande MÊME PAS les commandes au commerce", async () => {
    // Une requête de moins, et surtout aucun risque de croire qu'on a lu ce
    // qu'on va écrire : une journée close ne relit pas ce qui a changé depuis.
    const closed = ProductionDay.open(ServiceDay.of(DAY));
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, commerce } = subject(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(commerce.asked).toBe(0);
  });
});

/** Un réassort « pour demain » envoyé au Village (lot R3a). */
const VILLAGE_RESUPPLY = {
  resupplyId: "rs_1",
  siteId: "site_village",
  siteLabel: "Le Village",
  servedByTransfer: true,
  lines: [
    { sku: "VIE-001", productName: "Croissant", quantity: 12 },
    { sku: "PAIN-001", productName: "Baguette", quantity: 5 },
  ],
};

describe("le réassort au plan figé (lot R3a)", () => {
  const open = () => ProductionDay.open(ServiceDay.of(DAY));

  it("fige les réassorts à part des commandes, et les compte au TOTAL (décision B)", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY]);
    const { handler, days } = subject(open(), [order()], undefined, undefined, resupplies);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(days.saved?.orders.map((frozen) => frozen.orderId)).toEqual(["ord_1"]);
    expect(days.saved?.resupplies).toEqual([VILLAGE_RESUPPLY]);
    expect(days.saved?.counts).toEqual([
      { sku: "PAIN-001", productName: "Baguette", quantity: 5, done: null },
      { sku: "VIE-001", productName: "Croissant", quantity: 52, done: null },
    ]);
  });

  it("le fait porte les réassorts figés, le journal compte toujours les seules commandes", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY]);
    const { handler, events, durable } = subject(
      open(),
      [order()],
      undefined,
      undefined,
      resupplies,
    );

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.absorbed).toBe(1);
    expect(events.published).toEqual([new ProductionDayClosedJournalEvent(DAY, 1)]);
    expect(durable.facts[0]).toEqual(
      new ProductionDayClosedEvent(DAY, NOW, ["ord_1"], null, ["rs_1"]).durableFact(),
    );
  });

  it("une journée de réassorts seuls n'est pas vide : elle s'arrête", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY]);
    const { handler, days } = subject(open(), [], undefined, undefined, resupplies);

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.alreadyClosed).toBe(false);
    expect(days.saved?.orders).toEqual([]);
    expect(days.saved?.counts.map((count) => count.quantity)).toEqual([5, 12]);
  });

  it("refuse l'arrêt à la main avant l'heure du réassort, plus tardive que l'heure générale", async () => {
    // NOW = 20:00 à Paris la veille ; générale 19:00 + 30 min, réassort 20:30.
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "19:00", graceMinutes: 30 }]);
    const { handler, days } = subject(
      open(),
      [order()],
      undefined,
      cutoffs,
      undefined,
      new ResupplyTime("20:30"),
    );

    const refusal = handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    await expect(refusal).rejects.toThrow("le lundi 7 septembre à 20:30");
    expect(days.saved).toBeNull();
  });

  /** Lot R3b (§13.4 point 3) : le refus nommait l'heure générale même quand le réassort fixait l'arrêt. */
  it("le refus nomme l'heure du réassort quand c'est elle qui fixe l'arrêt", async () => {
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "19:00", graceMinutes: 30 }]);
    const { handler } = subject(
      open(),
      [order()],
      undefined,
      cutoffs,
      undefined,
      new ResupplyTime("20:30"),
    );

    const refusal = handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    await expect(refusal).rejects.toThrow("s'arrête tout seul à l'heure du réassort");
    await expect(refusal).rejects.toThrow("avancez l'heure du réassort");
  });
});

/** Un réassort « pour demain » au Labo, servi sur place (lot R3b). */
const LABO_RESUPPLY = {
  resupplyId: "rs_labo",
  siteId: "site_labo",
  siteLabel: "Le Labo",
  servedByTransfer: false,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6 }],
};

describe("le réassort à coliser (lot R3b)", () => {
  const open = () => ProductionDay.open(ServiceDay.of(DAY));
  const typesOf = (facts: readonly { readonly type: string }[]) => facts.map((fact) => fact.type);

  it("publie un fait par réassort d'un point servi par transfert, aucun pour le Labo", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY, LABO_RESUPPLY]);
    const { handler, durable } = subject(open(), [order()], undefined, undefined, resupplies);

    await handler.execute(new CloseProductionDayCommand(DAY));

    const drawn = durable.facts.filter((fact) => fact.type === PRODUCTION_RESUPPLY_LIST_DRAWN);
    expect(drawn).toEqual([
      new ResupplyListDrawnEvent(DAY, NOW, {
        resupplyId: "rs_1",
        siteId: "site_village",
        siteLabel: "Le Village",
        lines: VILLAGE_RESUPPLY.lines,
      }).durableFact(),
    ]);
    expect(drawn[0]?.key).toBe(`${PRODUCTION_RESUPPLY_LIST_DRAWN}:${DAY}:rs_1`);
    expect(typesOf(durable.facts)).toContain("production.packing_list_drawn");
  });

  it("la réannonce republie la même clé", async () => {
    const resupplies = new DayResupplies([VILLAGE_RESUPPLY]);
    const { handler, durable } = subject(open(), [order()], undefined, undefined, resupplies);
    await handler.execute(new CloseProductionDayCommand(DAY));
    const first = durable.facts.find((fact) => fact.type === PRODUCTION_RESUPPLY_LIST_DRAWN);

    await handler.execute(new CloseProductionDayCommand(DAY));

    const keys = durable.facts
      .filter((fact) => fact.type === PRODUCTION_RESUPPLY_LIST_DRAWN)
      .map((fact) => fact.key);
    expect(keys).toEqual([first?.key, first?.key]);
  });

  it("après une réouverture, la clé porte le suffixe de la réouverture", () => {
    const reopenedAt = new Date(NOW.getTime() - 60_000);
    const fact = new ResupplyListDrawnEvent(
      DAY,
      NOW,
      { resupplyId: "rs_1", siteId: "site_village", siteLabel: null, lines: [] },
      reopenedAt,
    ).durableFact();

    expect(fact.key).toBe(
      `${PRODUCTION_RESUPPLY_LIST_DRAWN}:${DAY}:rs_1:after-reopening:${reopenedAt.toISOString()}`,
    );
  });
});
