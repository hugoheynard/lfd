import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  BatchBackedDays,
  InMemoryBatches,
  RecordingDayLock,
} from "../../../day/application/__tests__/batch-doubles.js";
import {
  closedDay,
  CROISSANT,
  packingDay,
} from "../../../day/application/__tests__/closed-day-doubles.js";
import {
  InMemoryHandoffReader,
  returnCountsOf,
} from "../../../day/application/__tests__/handoff-doubles.js";
import {
  CountedProductNameReader,
  type ProductionDayRepository,
  ServiceDay,
} from "../../../day/index.js";
import { CancelBatchHandler } from "../commands/cancel-batch.handler.js";
import { MarkLineDoneHandler } from "../commands/mark-line-done.handler.js";
import { RecordBatchHandler } from "../commands/record-batch.handler.js";
import { ReportProblemHandler } from "../commands/report-problem.handler.js";
import { ResolveProblemHandler } from "../commands/resolve-problem.handler.js";
import { BatchRecording } from "../services/batch-recording.service.js";
import { DayTrackingLevelsFreezing } from "../services/day-tracking-levels-freezing.service.js";
import { OutputCorrecting } from "../services/output-correcting.service.js";
import { ProblemBell } from "../services/problem-bell.js";
import { handoffsOnDoubles } from "./packing-handoffs-doubles.js";
import { InMemoryProblems, RecordingBell } from "./problem-doubles.js";
import { InMemoryFrozenLevels, LONG_AGO, trackingReadingOf } from "./tracking-doubles.js";

/**
 * **Une journée arrêtée, colisée au colisage, et tous les gestes de la ligne**
 * — la scène des specs du rouge, de « Fait » et de « traité ». Ports doublés,
 * les vrais services d'écriture (`BatchRecording`, `PackingHandoffs`,
 * `OutputCorrecting`) branchés dessus.
 *
 * Aucune comparaison à l'horloge : les instants ne sont que recopiés.
 */
export const SCENE_NOW = new Date("2026-11-18T05:10:00.000Z");
export const SCENE_DAY = "2026-11-18";
/** Le croissant des journées doublées : 16 au compte, sur deux commandes. */
export const SCENE_SKU = CROISSANT;
export const SCENE_COUNT = 16;

function closedPackingDay() {
  return packingDay(closedDay(ServiceDay.of(SCENE_DAY), new Date("2026-11-18T04:20:00.000Z"), []));
}

/** La scène ; `trace` est le fil commun qui prouve un ordre. */
export function problemScene() {
  const trace: string[] = [];
  const store = new InMemoryBatches(trace);
  const handoffs = handoffsOnDoubles(trace);
  const days = new BatchBackedDays(
    closedPackingDay(),
    store,
    trace,
    returnCountsOf(handoffs.requests),
  );
  const lock = new RecordingDayLock(trace);
  const clock = new FixedClock(SCENE_NOW);
  const uow = new DirectUnitOfWork();
  const frozen = new InMemoryFrozenLevels(trace);
  const freezing = new DayTrackingLevelsFreezing(
    uow,
    lock,
    days,
    frozen.reader(),
    frozen.freezer(),
    trackingReadingOf({ frozen }),
    LONG_AGO,
    clock,
  );
  const problems = new InMemoryProblems();
  const events = new RecordingPublisher();
  const notifier = new RecordingBell();
  const afterCommit = new HeldAfterCommit();
  const intents = inMemoryIntents();
  const recording = new BatchRecording(store, handoffs.service);
  const authors = new FixedStaffAuthorDirectory(
    authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
  );
  const correcting = new OutputCorrecting(
    new InMemoryHandoffReader(handoffs.ledger),
    store,
    handoffs.durable,
  );
  return {
    trace,
    lock,
    clock,
    uow,
    freezing,
    recording,
    store,
    days,
    frozen,
    problems,
    events,
    notifier,
    afterCommit,
    ...handoffs,
    record: new RecordBatchHandler(days, lock, clock, uow, recording),
    cancel: new CancelBatchHandler(days, store, lock, clock, uow, handoffs.service),
    report: new ReportProblemHandler(
      days,
      lock,
      freezing,
      problems.repository(),
      correcting,
      recording,
      events,
      new ProblemBell(notifier, afterCommit, new BackgroundWork()),
      authors,
      new FixedIdGenerator("pb"),
      clock,
      uow,
      intents,
    ),
    done: new MarkLineDoneHandler(
      days,
      lock,
      freezing,
      problems.repository(),
      recording,
      new FixedIdGenerator("done"),
      clock,
      uow,
      intents,
    ),
    resolve: new ResolveProblemHandler(
      problems.repository(),
      new DayNames(days),
      lock,
      events,
      authors,
      clock,
      uow,
      intents,
    ),
  };
}

let keys = 0;
/** Une clé d'intention neuve, par geste. */
export const nextIntent = (): string => `intent_${String((keys += 1))}`;

/** Le nom au compte, lu sur la journée en mémoire de la scène. */
class DayNames extends CountedProductNameReader {
  constructor(private readonly days: ProductionDayRepository) {
    super();
  }

  async nameOf(day: ServiceDay, sku: string): Promise<string | null> {
    const current = await this.days.load(day);
    return current.counts.find((item) => item.sku === sku)?.productName ?? null;
  }
}
