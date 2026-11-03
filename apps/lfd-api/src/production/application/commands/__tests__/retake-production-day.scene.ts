import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  orderLine,
  producibleOrder,
} from "../../../channels/commerce/__tests__/producible-order.fixture.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { InMemoryBatches, RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { RecordingDurable } from "../../__tests__/handoff-doubles.js";
import { intakeReadingOf } from "../../__tests__/plan-intake-doubles.js";
import { InMemoryWithdrawals } from "../../__tests__/withdrawal-doubles.js";
import { RetakeRecording } from "../../services/retake-recording.js";
import { RetakeProductionDayHandler } from "../retake-production-day.handler.js";

/**
 * **La scène du retirage** — ce que les specs de `RetakeProductionDayHandler`
 * partagent, coupé de la spec unique (339 lignes) le 2026-11-03.
 */

/** Deux instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
export const TIRAGE = new Date("2026-09-13T04:20:00.000Z");
export const NOW = new Date("2026-09-13T06:20:00.000Z");
export const DAY = "2026-09-13";

/** Une commande de pain de seigle. */
export function order(orderId: string, quantity: number): ProducibleOrder {
  return producibleOrder(orderId, { lines: [orderLine("PAI-SEI", quantity, "Pain de seigle")] });
}

/** Le commerce doublé — il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Commerce extends DayOrdersReader {
  constructor(
    private readonly rows: readonly ProducibleOrder[],
    private readonly trace: string[],
  ) {
    super();
  }

  producibleFor(): Promise<readonly ProducibleOrder[]> {
    this.trace.push("producibleFor");
    return Promise.resolve(this.rows);
  }
}

/** Le dépôt doublé : il rend la journée posée, et retient ce qu'on lui sauve. */
export class Days extends ProductionDayRepository {
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

/** Une journée arrêtée sur la seule commande `ord_1`, coche de l'ancien poste posée ou non. */
export function closedDay(initials: string | null = null): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([order("ord_1", 30)], new Set<string>(), TIRAGE, null);
  if (initials === null) {
    return day;
  }
  const marked = day.toSnapshot();
  return ProductionDay.fromSnapshot({
    ...marked,
    counts: marked.counts.map((item) => ({
      ...item,
      done: { at: TIRAGE, by: "staff-1", initials },
    })),
  });
}

/** Les pièces qu'un test change ; le reste a un défaut neutre. */
export interface RetakeParts {
  readonly withdrawals?: InMemoryWithdrawals;
}

/** Le retirage monté sur ses doublés, la journée `day` en base ; une seule trace pour tous. */
export function retakeScene(
  day: ProductionDay,
  rows: readonly ProducibleOrder[],
  parts: RetakeParts = {},
) {
  const trace: string[] = [];
  const days = new Days(day, trace);
  const events = new RecordingPublisher();
  const batches = new InMemoryBatches(trace);
  const durable = new RecordingDurable();
  const handler = new RetakeProductionDayHandler(
    intakeReadingOf({
      days,
      orders: new Commerce(rows, trace),
      withdrawals: parts.withdrawals ?? new InMemoryWithdrawals(),
    }),
    new RetakeRecording(days, batches, durable),
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
    ),
    events,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    new RecordingDayLock(trace),
  );
  return { handler, days, events, batches, durable, trace };
}
