import { ScriptedCallDeadline } from "../../../platform/cache-calls/__tests__/cache-call-doubles.js";
import { sources } from "../../../platform/day-versions/__tests__/day-versions-doubles.js";
import type { DayContentsCache } from "../../../platform/day-versions/day-contents-cache.js";
import { DayContents } from "../../../platform/day-versions/day-contents.js";
import { DayVersionRegistry } from "../../../platform/day-versions/day-version-registry.js";
import { NoDayContentsCache } from "../../../platform/day-versions/no-day-contents-cache.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../platform/metrics/__tests__/metrics-doubles.js";
import type { Clock } from "../../../platform/time/clock.js";
import { FixedWallClock } from "../../../platform/time/fixed-wall-clock.js";
import type { ProductionWorksheetReading } from "../services/production-worksheet-reading.service.js";
import { WorksheetContents } from "../services/worksheet-contents.service.js";

// L'instant du mur des appels à l'objet, comparé à lui-même seulement (délai, disjoncteur).
const WALL_START = new Date(Date.UTC(2030, 0, 1));

/** Les contenus de journée autour d'un objet donné — « sans objet » par défaut. */
export function dayContentsOver(cache: DayContentsCache = new NoDayContentsCache()): DayContents {
  return new DayContents(
    cache,
    new ScriptedCallDeadline(),
    new FixedWallClock(WALL_START),
    new FixedStopwatch(3),
    new RecordingTimings(),
  );
}

/** La fiche servie par l'objet des journées, autour d'une lecture et d'une horloge. */
export function worksheetContentsAround(
  reading: ProductionWorksheetReading,
  clock: Clock,
  cache: DayContentsCache = new NoDayContentsCache(),
): WorksheetContents {
  return new WorksheetContents(
    new DayVersionRegistry(Object.values(sources())),
    dayContentsOver(cache),
    reading,
    clock,
  );
}
