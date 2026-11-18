import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import type { ServiceDay } from "../../../day/index.js";
import { WorkstationTrackingLevels } from "../../../workstations/index.js";
import { ProductionTrackingSettings } from "../../domain/entities/production-tracking-settings.js";
import { FrozenTrackingLevelsReader } from "../../domain/ports/day-tracking-levels.ports.js";
import { ProductionTrackingSettingsReader } from "../../domain/ports/production-tracking-settings.ports.js";
import { TrackingLevelsCommissioning } from "../../domain/ports/tracking-levels-commissioning.js";
import {
  DETAILED_DAY,
  type DayTrackingLevels,
  dayLevelsOf,
  resolvedLevels,
  servedBeforeService,
  type TrackedDay,
} from "../../domain/services/tracking-levels.js";

/**
 * **Les niveaux de suivi qu'une journée sert** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : le niveau figé
 * s'il existe ; en détaillé une journée arrêtée avant la mise en service, ou
 * ouverte alors qu'elle n'est pas arrivée ;
 * sinon les niveaux que le premier passage figera — le réglage du fournil et
 * celui de chaque poste, résolus maintenant.
 *
 * Il n'écrit rien : la fiche le lit (§ 4 de `CLAUDE.md`), le figement a son
 * service (`DayTrackingLevelsFreezing`).
 */
@Injectable()
export class DayTrackingLevelsReading {
  constructor(
    private readonly frozen: FrozenTrackingLevelsReader,
    private readonly settings: ProductionTrackingSettingsReader,
    private readonly workstations: WorkstationTrackingLevels,
    private readonly commissioning: TrackingLevelsCommissioning,
    private readonly clock: Clock,
  ) {}

  async levelsOf(day: ServiceDay, tracked: TrackedDay): Promise<DayTrackingLevels> {
    const frozen = await this.frozen.frozenOf(day);
    const since = this.commissioning.since();
    const now = this.clock.now();
    // Figée, ou d'avant la mise en service : les réglages ne sont pas lus.
    if (frozen !== null || servedBeforeService(tracked, since, now)) {
      return dayLevelsOf(tracked, frozen, since, now, DETAILED_DAY);
    }
    return this.currentLevels();
  }

  /** Le réglage du fournil et celui de chaque poste en service, résolus maintenant. */
  async currentLevels(): Promise<DayTrackingLevels> {
    const [settings, stations] = await Promise.all([
      this.settings.current(),
      this.workstations.ofActive(),
    ]);
    return resolvedLevels((settings ?? ProductionTrackingSettings.defaults()).level, stations);
  }
}
