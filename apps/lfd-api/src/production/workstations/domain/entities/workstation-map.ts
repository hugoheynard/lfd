import type { ProductionTrackingLevel } from "@lfd/contracts";

import {
  WorkstationArchivedError,
  WorkstationNameTakenError,
  WorkstationNotFoundError,
  WorkstationOrderMismatchError,
  WorkstationStillUsedError,
} from "../errors/workstation-errors.js";
import type { ProductSku } from "../value-objects/product-sku.js";
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

/** L'état d'une carte, tel qu'un dépôt le relit (`toDomain`). */
export interface WorkstationMapState {
  readonly workstations: readonly Workstation[];
  /** Référence produit → id du poste. */
  readonly placements: ReadonlyMap<string, string>;
  /** Référence produit → sa place dans la pile de son poste ; absent : pas encore réglée. */
  readonly positions: ReadonlyMap<string, number>;
}

/** Un produit sur son poste, et sa place dans la pile du poste. */
export interface ProductPlacement {
  readonly workstationId: string;
  /** `null` : jamais réglée — le produit vient après ceux qui en ont une, dans l'ordre reçu. */
  readonly position: number | null;
}

/** Ce qu'un `save` doit écrire : la différence, jamais la carte entière. */
export interface WorkstationMapChanges {
  readonly workstations: readonly Workstation[];
  /** Référence produit → son poste et sa place, ou `null` : remis « à ranger ». */
  readonly placements: ReadonlyMap<string, ProductPlacement | null>;
}

/** `list` nomme exactement `expected`, chacun une fois, dans n'importe quel ordre. */
function namesExactly(list: readonly string[], expected: readonly string[]): boolean {
  const known = new Set(expected);
  return (
    new Set(list).size === list.length &&
    list.length === known.size &&
    list.every((name) => known.has(name))
  );
}

/**
 * **La carte des postes du fournil** : ses postes et le poste de chaque
 * produit (décision de Hugo, 2026-11-16 — un poste par produit, ses
 * déclinaisons en héritent).
 *
 * Un agrégat, parce que trois règles refusent une écriture, et que chacune se
 * juge sur l'ensemble : deux postes en service ne portent pas le même nom, un
 * poste qui porte des produits ne s'archive pas, et aucun produit ne va sur un
 * poste archivé. Les refus vivent ici : un handler de plus ne peut pas les
 * oublier.
 *
 * La carte retient ce qu'elle a changé (`changes`) : le dépôt n'écrit que la
 * différence, sur une carte de quelques centaines de produits.
 */
export class WorkstationMap {
  private readonly stations: Map<string, Workstation>;
  private readonly placed: Map<string, ProductPlacement>;
  private readonly changedStations = new Set<string>();
  private readonly changedPlacements = new Set<string>();

  private constructor(state: WorkstationMapState) {
    this.stations = new Map(state.workstations.map((station) => [station.id, station]));
    this.placed = new Map(
      [...state.placements].map(([product, workstationId]) => [
        product,
        { workstationId, position: state.positions.get(product) ?? null },
      ]),
    );
  }

  /** Personne n'a encore rien réglé. */
  static empty(): WorkstationMap {
    return new WorkstationMap({ workstations: [], placements: new Map(), positions: new Map() });
  }

  /** La carte relue en base : ses noms ont déjà été validés à l'écriture. */
  static rehydrate(state: WorkstationMapState): WorkstationMap {
    return new WorkstationMap(state);
  }

  /** Les postes en service, dans l'ordre des fiches. */
  active(): readonly Workstation[] {
    return [...this.stations.values()]
      .filter((station) => station.archivedAt === null)
      .sort((left, right) => left.position - right.position);
  }

  workstationOf(product: string): string | null {
    return this.placed.get(product)?.workstationId ?? null;
  }

  /** Sa place dans la pile de son poste ; `null` : sans poste, ou jamais réglée. */
  positionOf(product: string): number | null {
    return this.placed.get(product)?.position ?? null;
  }

  placedCount(): number {
    return this.placed.size;
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
    const used = this.productsOn(id).length;
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

  /**
   * Place des produits sur un poste, ou les remet « à ranger » (`null`).
   *
   * Le poste qu'un produit quitte compte parmi les changements : sa ligne est
   * réécrite à l'instant du geste. Sans quoi un produit remis « à ranger »
   * n'écrirait qu'une suppression, et le numéro de la carte
   * (`WorkstationMapVersion`), qui lit l'instant le plus récent, ne bougerait
   * pas.
   *
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError}
   */
  place(products: readonly ProductSku[], workstationId: string | null): void {
    if (workstationId !== null) {
      this.activeStation(workstationId);
    }
    for (const product of products) {
      const current = this.placed.get(product.value)?.workstationId ?? null;
      if (current === workstationId) {
        continue;
      }
      if (current !== null && this.stations.has(current)) {
        this.changedStations.add(current);
      }
      if (workstationId === null) {
        this.placed.delete(product.value);
      } else {
        this.placed.set(product.value, { workstationId, position: this.bottomOf(workstationId) });
      }
      this.changedPlacements.add(product.value);
    }
  }

  /**
   * **La pile d'un poste** : l'ordre dans lequel le poste voit ses produits,
   * partout où le mode prod range. `productSkus` nomme exactement les
   * produits du poste, chacun une fois, du haut vers le bas. Les places qui
   * ne changent pas ne s'écrivent pas.
   *
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError} un poste archivé ne se règle plus.
   * @throws {WorkstationOrderMismatchError} la liste n'est pas exactement la pile du poste.
   */
  reorderProducts(workstationId: string, productSkus: readonly ProductSku[]): void {
    const station = this.activeStation(workstationId);
    const skus = productSkus.map((product) => product.value);
    if (!namesExactly(skus, this.productsOn(workstationId))) {
      throw new WorkstationOrderMismatchError(station.name);
    }
    skus.forEach((sku, position) => {
      if (this.placed.get(sku)?.position !== position) {
        this.placed.set(sku, { workstationId, position });
        this.changedPlacements.add(sku);
      }
    });
  }

  /** Ce que le dépôt écrit. */
  changes(): WorkstationMapChanges {
    const workstations = [...this.changedStations].flatMap((id) => {
      const station = this.stations.get(id);
      return station === undefined ? [] : [station];
    });
    const placements = new Map<string, ProductPlacement | null>(
      [...this.changedPlacements].map((product) => [product, this.placed.get(product) ?? null]),
    );
    return { workstations, placements };
  }

  private productsOn(workstationId: string): string[] {
    return [...this.placed]
      .filter(([, placement]) => placement.workstationId === workstationId)
      .map(([product]) => product);
  }

  /**
   * La place d'un produit qui arrive sur un poste : **en bas** de sa pile.
   * Tant qu'un produit du poste n'a pas de place réglée, le nouveau n'en a
   * pas non plus : il rejoint la queue sans place, après les places réglées
   * (une place numérotée le ferait passer AU-DESSUS de cette queue).
   */
  private bottomOf(workstationId: string): number | null {
    let last = -1;
    for (const product of this.productsOn(workstationId)) {
      const position = this.placed.get(product)?.position ?? null;
      if (position === null) {
        return null;
      }
      last = Math.max(last, position);
    }
    return last + 1;
  }

  private activeStation(id: string): Workstation {
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
