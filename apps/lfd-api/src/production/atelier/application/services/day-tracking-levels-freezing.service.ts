import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ProductionDayLock, ProductionDayRepository, type ServiceDay } from "../../../day/index.js";
import {
  DayTrackingLevelsFreezer,
  FrozenTrackingLevelsReader,
} from "../../domain/ports/day-tracking-levels.ports.js";
import { TrackingLevelsCommissioning } from "../../domain/ports/tracking-levels-commissioning.js";
import { type DayTrackingLevels, mustFreeze } from "../../domain/services/tracking-levels.js";
import { DayTrackingLevelsReading } from "./day-tracking-levels-reading.service.js";

/**
 * **Le niveau de suivi figé au premier passage d'une journée arrêtée** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.1).
 *
 * Sous le verrou de la journée, relue sous lui : arrêtée depuis la mise en
 * service et sans niveau figé, elle reçoit le niveau du fournil et de chaque
 * poste, résolus à cet instant. L'insertion ignore le conflit sur la journée :
 * une journée réouverte, reprise ou réannoncée garde son premier niveau.
 *
 * Rend les niveaux que la journée sert désormais. Il ouvre son unité de
 * travail, ou rejoint celle de l'appelant (le geste qui va écrire une fournée
 * sous le même verrou).
 */
@Injectable()
export class DayTrackingLevelsFreezing {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly lock: ProductionDayLock,
    private readonly days: ProductionDayRepository,
    private readonly frozen: FrozenTrackingLevelsReader,
    private readonly freezer: DayTrackingLevelsFreezer,
    private readonly reading: DayTrackingLevelsReading,
    private readonly commissioning: TrackingLevelsCommissioning,
    private readonly clock: Clock,
  ) {}

  freezeIfDue(day: ServiceDay): Promise<DayTrackingLevels> {
    return this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.days.load(day);
      const tracked = { closedAt: current.closedAt };
      const frozen = await this.frozen.frozenOf(day);
      const since = this.commissioning.since();
      if (!mustFreeze(tracked, frozen, since)) {
        return frozen ?? (await this.reading.levelsOf(day, tracked));
      }
      const levels = await this.reading.currentLevels();
      await this.freezer.freeze(day, levels, this.clock.now());
      // Sous le verrou, personne n'a pu figer entre la relecture et l'insertion.
      return levels;
    });
  }
}
