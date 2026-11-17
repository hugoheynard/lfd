import type { ProductionTrackingLevel } from "@lfd/contracts";

/**
 * **Le niveau de suivi d'une journée et de ses lignes** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) — des fonctions
 * pures.
 *
 * - Le niveau d'une ligne : celui de son poste, sinon celui du fournil. Une
 *   ligne sans poste, ou d'un poste inconnu de la journée (créé ou archivé
 *   depuis), suit le fournil.
 * - Le niveau d'une journée est **figé** à son premier passage après l'arrêt
 *   — le fournil et chaque poste, résolus à cet instant —, et ne bouge plus :
 *   un changement de réglage vaut pour la journée suivante.
 * - Une journée arrêtée **avant la mise en service** (`since`) reste en
 *   détaillé, et n'est jamais figée.
 */

/** Les niveaux d'une journée : le fournil, et chaque poste résolu. */
export interface DayTrackingLevels {
  readonly house: ProductionTrackingLevel;
  /** Id de poste → son niveau résolu (le sien, sinon celui du fournil). */
  readonly workstations: ReadonlyMap<string, ProductionTrackingLevel>;
}

/** Un poste et son niveau propre, tel que les postes le publient. */
export interface OwnTrackingLevel {
  readonly id: string;
  /** `null` : le poste suit le fournil. */
  readonly trackingLevel: ProductionTrackingLevel | null;
}

/** Ce que la règle lit d'une journée. */
export interface TrackedDay {
  /** `null` : la journée n'est pas arrêtée. */
  readonly closedAt: Date | null;
}

/** Une journée d'avant la mise en service : tout ce qui existait, rien d'automatique. */
export const DETAILED_DAY: DayTrackingLevels = { house: "detailed", workstations: new Map() };

/** Les niveaux résolus maintenant, à partir du réglage du fournil et des postes. */
export function resolvedLevels(
  house: ProductionTrackingLevel,
  stations: readonly OwnTrackingLevel[],
): DayTrackingLevels {
  return {
    house,
    workstations: new Map(stations.map((station) => [station.id, station.trackingLevel ?? house])),
  };
}

/** Arrêtée avant la mise en service : en détaillé pour toujours. */
export function arrestedBeforeService(day: TrackedDay, since: Date): boolean {
  return day.closedAt !== null && day.closedAt.getTime() < since.getTime();
}

/**
 * La journée doit-elle être figée maintenant ? Arrêtée, depuis la mise en
 * service, et sans niveau figé.
 */
export function mustFreeze(
  day: TrackedDay,
  frozen: DayTrackingLevels | null,
  since: Date,
): boolean {
  return frozen === null && day.closedAt !== null && !arrestedBeforeService(day, since);
}

/**
 * **Les niveaux qu'une journée sert** : le niveau figé s'il existe ; une
 * journée arrêtée avant la mise en service, en détaillé ; sinon ceux que le
 * premier passage figera (`current`) — une journée ouverte, ou arrêtée et pas
 * encore figée.
 */
export function dayLevelsOf(
  day: TrackedDay,
  frozen: DayTrackingLevels | null,
  since: Date,
  current: DayTrackingLevels,
): DayTrackingLevels {
  if (frozen !== null) {
    return frozen;
  }
  return arrestedBeforeService(day, since) ? DETAILED_DAY : current;
}

/** Le niveau d'une ligne : celui de son poste dans la journée, sinon celui du fournil. */
export function lineLevelOf(
  levels: DayTrackingLevels,
  workstationId: string | null | undefined,
): ProductionTrackingLevel {
  return (
    (workstationId === null || workstationId === undefined
      ? undefined
      : levels.workstations.get(workstationId)) ?? levels.house
  );
}

/**
 * Tous les postes de la journée sont-ils au niveau du fournil ? Alors chaque
 * ligne l'est aussi, sans avoir à lire le poste de ses articles.
 */
export function isUniform(levels: DayTrackingLevels): boolean {
  return [...levels.workstations.values()].every((level) => level === levels.house);
}
