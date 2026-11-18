import { FixedDueThresholds } from "../../../channels/commerce/__tests__/due-thresholds-doubles.js";
import type { DayDueThresholds } from "../../../channels/commerce/due-thresholds.reader.js";
import { InMemoryTrancheSettings } from "../../../day/application/__tests__/production-tranche-settings-doubles.js";
import { BAGUETTE } from "../../../day/application/__tests__/closed-day-doubles.js";
import { ProductionTrancheSettings } from "../../../day/index.js";
import { ProductionTrackingSettings } from "../../domain/entities/production-tracking-settings.js";
import { RunAlwaysGreenLineHandler } from "../commands/run-always-green-line.handler.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import { placementPorts } from "../../../workstations/application/__tests__/placement-doubles.js";
import { AlwaysGreenLines } from "../services/always-green-lines.service.js";
import { UnconfirmedLinesReading } from "../services/unconfirmed-lines-reading.service.js";
import { WorksheetDeadlinesReading } from "../services/worksheet-deadlines-reading.service.js";
import { WorksheetTrackingLevelsReading } from "../services/worksheet-tracking-levels.js";
import { problemScene, SCENE_SKU } from "./problem-scene.js";
import { InMemoryTrackingSettings, trackingReadingOf } from "./tracking-doubles.js";

/**
 * **La scène de la fournée automatique** — celle du rouge et de « Fait »
 * (`problemScene`), plus les paliers du commerce et le réglage de suivi.
 *
 * Le croissant (16 au compte) a deux paliers : 10 avant 07:00 et 6 avant
 * 09:00 ; la baguette n'en a aucun. Les heures se comparent à l'horloge de
 * la scène, posée par le test sur la même journée : rien n'est lu au mur.
 */
export const CROISSANT_DUE: DayDueThresholds = {
  deliveryMarginMinutes: 30,
  pickupMarginMinutes: 30,
  items: [
    {
      sku: SCENE_SKU,
      productName: "Croissant",
      total: 16,
      thresholds: [
        { kind: "deadline", before: "07:00", quantity: 10, cumulative: 10 },
        { kind: "deadline", before: "09:00", quantity: 6, cumulative: 16 },
      ],
    },
  ],
};

export const SCENE_MARGIN = 15;
export { BAGUETTE };

export function alwaysGreenScene(due: DayDueThresholds | "down" = CROISSANT_DUE) {
  const scene = problemScene();
  const tranches = new InMemoryTrancheSettings(ProductionTrancheSettings.set("computed", []));
  const settings = new InMemoryTrackingSettings(
    ProductionTrackingSettings.of({ level: "always_green", marginMinutes: SCENE_MARGIN }),
  );
  const deadlines = new WorksheetDeadlinesReading(new FixedDueThresholds(due), tranches.reader());
  const lines = new AlwaysGreenLines(
    new WorksheetTrackingLevelsReading(new GroupingSourceReading(...placementPorts())),
  );
  return {
    ...scene,
    deadlines,
    lines,
    trackingSettings: settings,
    unconfirmed: new UnconfirmedLinesReading(
      trackingReadingOf({ frozen: scene.frozen, settings }),
      lines,
      deadlines,
      scene.problems.dayReader(),
    ),
    line: new RunAlwaysGreenLineHandler(
      scene.days,
      scene.lock,
      deadlines,
      settings.reader(),
      scene.problems.repository(),
      scene.recording,
      scene.clock,
      scene.uow,
    ),
  };
}
