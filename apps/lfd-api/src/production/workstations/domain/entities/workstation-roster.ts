import type { ProductionTrackingLevel } from "@lfd/contracts";

import {
  WorkstationArchivedError,
  WorkstationNameTakenError,
  WorkstationNotFoundError,
  WorkstationOrderMismatchError,
  WorkstationStillUsedError,
} from "../errors/workstation-errors.js";
import { WorkstationName } from "../value-objects/workstation-name.js";

/** Un poste, tel que la carte le tient. */
export interface Workstation {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  /** `null` : en service. */
  readonly archivedAt: Date | null;
  /** Le niveau de suivi propre au poste ; `null` : il suit le fournil. */
  readonly trackingLevel: ProductionTrackingLevel | null;
}

/** `list` nomme exactement `expected`, chacun une fois, dans n'importe quel ordre. */
export function namesExactly(list: readonly string[], expected: readonly string[]): boolean {
  const known = new Set(expected);
  return (
    new Set(list).size === list.length &&
    list.length === known.size &&
    list.every((name) => known.has(name))
  );
}

/**
 * **Les postes de la carte** : la moitié de `WorkstationMap` qui ne regarde
 * que les postes — leur nom, leur ordre, leur niveau, leur archivage. Deux
 * postes en service ne portent pas le même nom, et un poste qui porte des
 * produits ne s'archive pas (la carte dit combien il en porte).
 */
export abstract class WorkstationRoster {
  protected readonly stations: Map<string, Workstation>;
  protected readonly changedStations = new Set<string>();

  protected constructor(workstations: readonly Workstation[]) {
    this.stations = new Map(workstations.map((station) => [station.id, station]));
  }

  /** Combien de produits ont une ligne chez ce poste. */
  protected abstract productCountOn(workstationId: string): number;

  /** Les postes en service, dans l'ordre des fiches. */
  active(): readonly Workstation[] {
    return [...this.stations.values()]
      .filter((station) => station.archivedAt === null)
      .sort((left, right) => left.position - right.position);
  }

  /**
   * Un poste neuf, en dernier.
   *
   * @throws {WorkstationNameTakenError} un poste en service porte déjà ce nom.
   */
  declare(id: string, rawName: string): void {
    const name = WorkstationName.of(rawName);
    this.refuseTakenName(name, null);
    const last = this.active().at(-1)?.position ?? -1;
    this.write({ id, name: name.value, position: last + 1, archivedAt: null, trackingLevel: null });
  }

  /**
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError} un poste archivé ne se renomme plus.
   * @throws {WorkstationNameTakenError}
   */
  rename(id: string, rawName: string): void {
    const station = this.activeStation(id);
    const name = WorkstationName.of(rawName);
    this.refuseTakenName(name, id);
    if (station.name === name.value) {
      return;
    }
    this.write({ ...station, name: name.value });
  }

  /**
   * Le nouvel ordre des fiches : exactement les postes en service, chacun une
   * fois.
   *
   * @throws {WorkstationOrderMismatchError}
   */
  reorder(ids: readonly string[]): void {
    const active = this.active();
    if (
      !namesExactly(
        ids,
        active.map((station) => station.id),
      )
    ) {
      throw new WorkstationOrderMismatchError();
    }
    ids.forEach((id, position) => {
      const station = this.activeStation(id);
      if (station.position !== position) {
        this.write({ ...station, position });
      }
    });
  }

  /**
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError} déjà archivé.
   * @throws {WorkstationStillUsedError} il porte encore des produits.
   */
  archive(id: string, at: Date): void {
    const station = this.activeStation(id);
    const used = this.productCountOn(id);
    if (used > 0) {
      throw new WorkstationStillUsedError(station.name, used);
    }
    this.write({ ...station, archivedAt: at });
  }

  /**
   * Le niveau de suivi propre au poste, ou `null` : il suit le fournil (
   * `fournil/les-niveaux-de-suivi.md`). Il vaut à partir de la
   * prochaine journée arrêtée : une journée garde le niveau figé à son premier
   * passage. Le même niveau, reposé, ne change rien.
   *
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError} un poste archivé ne se règle plus.
   */
  setTrackingLevel(id: string, level: ProductionTrackingLevel | null): void {
    const station = this.activeStation(id);
    if (station.trackingLevel === level) {
      return;
    }
    this.write({ ...station, trackingLevel: level });
  }

  /** Les postes changés : ceux qu'on a réglés, et ceux qu'un produit a quittés. */
  protected changedWorkstations(): readonly Workstation[] {
    return [...this.changedStations].flatMap((id) => {
      const station = this.stations.get(id);
      return station === undefined ? [] : [station];
    });
  }

  /**
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError}
   */
  protected activeStation(id: string): Workstation {
    const station = this.stations.get(id);
    if (station === undefined) {
      throw new WorkstationNotFoundError();
    }
    if (station.archivedAt !== null) {
      throw new WorkstationArchivedError(station.name);
    }
    return station;
  }

  private refuseTakenName(name: WorkstationName, except: string | null): void {
    const taken = this.active().find(
      (station) => station.id !== except && WorkstationName.of(station.name).sameAs(name),
    );
    if (taken !== undefined) {
      throw new WorkstationNameTakenError(taken.name);
    }
  }

  private write(station: Workstation): void {
    this.stations.set(station.id, station);
    this.changedStations.add(station.id);
  }
}
