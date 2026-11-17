import { dayContentsOver } from "../../../../platform/day-versions/__tests__/day-contents-doubles.js";
import { sources } from "../../../../platform/day-versions/__tests__/day-versions-doubles.js";
import type { DayContentsCache } from "../../../../platform/day-versions/day-contents-cache.js";
import { DayVersionRegistry } from "../../../../platform/day-versions/day-version-registry.js";
import { NoDayContentsCache } from "../../../../platform/day-versions/no-day-contents-cache.js";
import type { Clock } from "../../../../platform/time/clock.js";
import type { ProductionWorksheetReading } from "../services/production-worksheet-reading.service.js";
import { WorksheetContents } from "../services/worksheet-contents.service.js";
import { SettableDisplaySettingsVersion } from "../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { SettableWorkstationMapVersion } from "../../../workstations/application/__tests__/placement-doubles.js";
import { InMemoryTrackingSettings } from "./tracking-doubles.js";

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
    new SettableDisplaySettingsVersion(),
    new SettableWorkstationMapVersion(),
    new InMemoryTrackingSettings().version(),
  );
}
