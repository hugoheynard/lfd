import type { ProductionTrackingLevel } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ServiceDay, TrancheSettingsAuthor } from "../../../day/index.js";
import { GroupingSourceReading, WorkstationTrackingLevels } from "../../../workstations/index.js";
import { placementPorts } from "../../../workstations/application/__tests__/placement-doubles.js";
import type { ProductionTrackingSettings } from "../../domain/entities/production-tracking-settings.js";
import {
  DayTrackingLevelsFreezer,
  FrozenTrackingLevelsReader,
} from "../../domain/ports/day-tracking-levels.ports.js";
import {
  ProductionTrackingSettingsReader,
  ProductionTrackingSettingsRepository,
  ProductionTrackingSettingsVersion,
} from "../../domain/ports/production-tracking-settings.ports.js";
import { TrackingLevelsCommissioning } from "../../domain/ports/tracking-levels-commissioning.js";
import type { DayTrackingLevels, OwnTrackingLevel } from "../../domain/services/tracking-levels.js";
import { DayTrackingLevelsReading } from "../services/day-tracking-levels-reading.service.js";
import { WorksheetTrackingLevelsReading } from "../services/worksheet-tracking-levels.js";

/**
 * Les doublés des niveaux de suivi — chacun ÉTEND son port, donc aucun cast.
 * Partagés par les specs de la fiche, du réglage et du figement.
 */

/** Une sauvegarde du réglage, telle que le dépôt l'a reçue. */
export interface SavedTrackingSettings {
  readonly settings: ProductionTrackingSettings;
  readonly at: Date;
  readonly author: TrancheSettingsAuthor;
}

/** La ligne unique du réglage, en mémoire : lire, écrire et son numéro. */
export class InMemoryTrackingSettings {
  current: ProductionTrackingSettings | null;
  readonly saves: SavedTrackingSettings[] = [];

  constructor(initial: ProductionTrackingSettings | null = null) {
    this.current = initial;
  }

  reader(): ProductionTrackingSettingsReader {
    return new TrackingSettingsReaderOver(this);
  }

  repository(): ProductionTrackingSettingsRepository {
    return new TrackingSettingsRepositoryOver(this);
  }

  version(): ProductionTrackingSettingsVersion {
    return new TrackingSettingsVersionOver(this);
  }
}

class TrackingSettingsReaderOver extends ProductionTrackingSettingsReader {
  constructor(private readonly table: InMemoryTrackingSettings) {
    super();
  }

  current(): Promise<ProductionTrackingSettings | null> {
    return Promise.resolve(this.table.current);
  }
}

class TrackingSettingsRepositoryOver extends ProductionTrackingSettingsRepository {
  constructor(private readonly table: InMemoryTrackingSettings) {
    super();
  }

  save(
    settings: ProductionTrackingSettings,
    at: Date,
    author: TrancheSettingsAuthor,
  ): Promise<void> {
    this.table.current = settings;
    this.table.saves.push({ settings, at, author });
    return Promise.resolve();
  }
}

class TrackingSettingsVersionOver extends ProductionTrackingSettingsVersion {
  constructor(private readonly table: InMemoryTrackingSettings) {
    super();
  }

  versionOf(): Promise<number> {
    return Promise.resolve(this.table.saves.at(-1)?.at.getTime() ?? 0);
  }
}

/** La table des niveaux figés, en mémoire, avec la sémantique de la vraie : le premier gagne. */
export class InMemoryFrozenLevels {
  readonly rows = new Map<string, DayTrackingLevels>();
  readonly attempts: string[] = [];

  constructor(readonly trace: string[] = []) {}

  reader(): FrozenTrackingLevelsReader {
    return new FrozenLevelsReaderOver(this);
  }

  freezer(): DayTrackingLevelsFreezer {
    return new FrozenLevelsFreezerOver(this);
  }
}

class FrozenLevelsReaderOver extends FrozenTrackingLevelsReader {
  constructor(private readonly table: InMemoryFrozenLevels) {
    super();
  }

  frozenOf(day: ServiceDay): Promise<DayTrackingLevels | null> {
    this.table.trace.push(`frozen?:${day.value}`);
    return Promise.resolve(this.table.rows.get(day.value) ?? null);
  }
}

class FrozenLevelsFreezerOver extends DayTrackingLevelsFreezer {
  constructor(private readonly table: InMemoryFrozenLevels) {
    super();
  }

  freeze(day: ServiceDay, levels: DayTrackingLevels): Promise<void> {
    this.table.trace.push(`freeze:${day.value}`);
    this.table.attempts.push(day.value);
    if (!this.table.rows.has(day.value)) {
      this.table.rows.set(day.value, levels);
    }
    return Promise.resolve();
  }
}

/** Les postes en service et leur niveau propre, fixés. */
export class FixedWorkstationTrackingLevels extends WorkstationTrackingLevels {
  constructor(public stations: readonly OwnTrackingLevel[] = []) {
    super();
  }

  ofActive(): Promise<readonly OwnTrackingLevel[]> {
    return Promise.resolve(this.stations);
  }
}

/** La mise en service, fixée par le test. */
export class FixedCommissioning extends TrackingLevelsCommissioning {
  constructor(private readonly at: Date) {
    super();
  }

  since(): Date {
    return this.at;
  }
}

/** Une mise en service si ancienne que toute journée la suit. */
export const LONG_AGO = new FixedCommissioning(new Date(0));

/** Ce que la lecture des niveaux lit, à régler par test. */
export interface TrackingScene {
  readonly house?: ProductionTrackingLevel;
  readonly settings?: InMemoryTrackingSettings;
  readonly frozen?: InMemoryFrozenLevels;
  readonly stations?: readonly OwnTrackingLevel[];
  readonly commissioning?: TrackingLevelsCommissioning;
}

/** La lecture des niveaux d'une journée sur une scène en mémoire. */
export function trackingReadingOf(scene: TrackingScene = {}): DayTrackingLevelsReading {
  return new DayTrackingLevelsReading(
    (scene.frozen ?? new InMemoryFrozenLevels()).reader(),
    (scene.settings ?? new InMemoryTrackingSettings()).reader(),
    new FixedWorkstationTrackingLevels(scene.stations ?? []),
    scene.commissioning ?? LONG_AGO,
    new FixedClock(new Date(0)),
  );
}

/**
 * Les deux dernières dépendances de la lecture de la fiche, à étaler : les
 * niveaux de la journée et ceux des lignes. Sans scène, le fournil par défaut
 * (toujours vert) et aucun poste réglé — les postes ne sont jamais lus.
 */
export function trackingPorts(
  scene: TrackingScene = {},
  grouping: GroupingSourceReading = new GroupingSourceReading(...placementPorts()),
): readonly [DayTrackingLevelsReading, WorksheetTrackingLevelsReading] {
  return [trackingReadingOf(scene), new WorksheetTrackingLevelsReading(grouping)];
}

/** Le numéro du réglage de suivi, à faire monter par le test. */
export class SettableTrackingSettingsVersion extends ProductionTrackingSettingsVersion {
  version = 0;

  versionOf(): Promise<number> {
    return Promise.resolve(this.version);
  }
}
