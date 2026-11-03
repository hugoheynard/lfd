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
import { producibleOrder } from "../../../channels/commerce/__tests__/producible-order.fixture.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { PendingSettlementSweeper } from "../../../channels/commerce/pending-settlement.sweeper.js";
import { ProductionDayClosedEvent } from "../../../channels/commerce/production-day-closed.event.js";
import { PackingListDrawnEvent } from "../../../channels/packing/packing-list-drawn.event.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import type { ProductionDayStatusReader } from "../../../domain/ports/production-day-status.reader.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { admissionOf, intakeReadingOf } from "../../__tests__/plan-intake-doubles.js";
import {
  type CutoffRules,
  DayResupplies,
  type ResupplyTime,
} from "../../__tests__/settings-doubles.js";
import { InMemoryWithdrawals } from "../../__tests__/withdrawal-doubles.js";
import { PlanArrestRecording } from "../../services/plan-arrest-recording.js";
import { CloseProductionDayHandler } from "../close-production-day.handler.js";

/**
 * **La scène de l'arrêt du plan** — les doublés que les specs de
 * `CloseProductionDayHandler` partagent. Coupée de la spec unique (749 lignes)
 * le 2026-11-03 : une spec par sujet (l'heure limite, l'arrêt, la réannonce,
 * le réassort), une seule scène.
 *
 * `NOW` est 20:00 à Paris, la veille de `DAY` ; les dates ne sont comparées
 * qu'à `FixedClock(NOW)`, jamais à l'horloge murale.
 */

export const NOW = new Date("2026-09-07T18:00:00.000Z");
export const EARLIER = new Date("2026-09-07T17:00:00.000Z");
export const DAY = "2026-09-08";

/** La commande de référence : `ord_1`, « ORD-0001 », quarante croissants. */
export function order(overrides: Partial<ProducibleOrder> = {}): ProducibleOrder {
  return producibleOrder("ord_1", { reference: "ORD-0001", ...overrides });
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
export function closedFact(
  orderIds: readonly string[],
  closedAt: Date,
  reannouncedAt: Date | null = null,
) {
  return new ProductionDayClosedEvent(DAY, closedAt, orderIds, reannouncedAt).durableFact();
}

/** La commande à coliser de référence (colisage, K1) — un fait par commande. */
export function listFact(source: ProducibleOrder, drawnAt: Date) {
  return new PackingListDrawnEvent(DAY, drawnAt, {
    orderId: source.orderId,
    rank: 1,
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

/** Les pièces qu'un test change ; le reste a un défaut neutre. */
export interface SceneParts {
  readonly withdrawals?: InMemoryWithdrawals;
  readonly cutoffs?: CutoffRules;
  readonly resupplies?: DayResupplies;
  readonly resupplyTime?: ResupplyTime;
  /** L'en-tête lu hors verrou ; par défaut, celui de la journée doublée. */
  readonly status?: ProductionDayStatusReader;
}

/** La clôture montée sur ses doublés, la journée `day` en base. */
export function closeScene(
  day: ProductionDay,
  rows: readonly ProducibleOrder[],
  parts: SceneParts = {},
) {
  const days = new Days(day);
  const calls: CommerceCall[] = [];
  const commerce = new Commerce(rows, calls);
  const sweeper = new Sweeper(calls);
  const uow = new ObservedUnitOfWork();
  const events = new Publisher(uow);
  const durable = new Durable(uow);
  const withdrawals = parts.withdrawals ?? new InMemoryWithdrawals();
  const clock = new FixedClock(NOW);
  const admission = admissionOf({
    days,
    clock,
    sweeper,
    ...(parts.status === undefined ? {} : { status: parts.status }),
    ...(parts.cutoffs === undefined ? {} : { cutoffs: parts.cutoffs }),
    ...(parts.resupplyTime === undefined ? {} : { resupplyTime: parts.resupplyTime }),
    authors: new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
    ),
  });
  const reading = intakeReadingOf({
    days,
    orders: commerce,
    withdrawals,
    resupplies: parts.resupplies ?? new DayResupplies(),
  });
  return {
    durable,
    days,
    withdrawals,
    commerce,
    sweeper,
    calls,
    events,
    handler: new CloseProductionDayHandler(
      admission,
      reading,
      new PlanArrestRecording(days, durable),
      events,
      clock,
      uow,
      new RecordingDayLock(),
    ),
  };
}

/** Une journée jamais arrêtée. */
export function openDay(): ProductionDay {
  return ProductionDay.open(ServiceDay.of(DAY));
}

/** Une journée arrêtée à `EARLIER` sur la commande par défaut. */
export function closedDay(): ProductionDay {
  const day = openDay();
  day.close([order()], new Set<string>(), EARLIER, null);
  return day;
}

/** Un réassort « pour demain » envoyé au Village (lot R3a). */
export const VILLAGE_RESUPPLY = {
  resupplyId: "rs_1",
  siteId: "site_village",
  siteLabel: "Le Village",
  name: null,
  servedByTransfer: true,
  lines: [
    { sku: "VIE-001", productName: "Croissant", quantity: 12, saleUnit: "piece" as const },
    { sku: "PAIN-001", productName: "Baguette", quantity: 5, saleUnit: "piece" as const },
  ],
};

/** Un réassort « pour demain » au Labo, servi sur place (lot R3b). */
export const LABO_RESUPPLY = {
  resupplyId: "rs_labo",
  siteId: "site_labo",
  siteLabel: "Le Labo",
  name: null,
  servedByTransfer: false,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece" as const }],
};
