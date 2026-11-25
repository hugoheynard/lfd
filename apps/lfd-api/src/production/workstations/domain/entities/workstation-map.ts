import {
  FinishingWorkstationStillNeededError,
  WorkstationNotOfProductError,
  WorkstationOrderMismatchError,
} from "../errors/workstation-errors.js";
import type { ProductSku } from "../value-objects/product-sku.js";
import {
  type PlacementChange,
  type ProductStation,
  ProductPlacements,
} from "./product-placements.js";
import { namesExactly, type Workstation, WorkstationRoster } from "./workstation-roster.js";

export type { Workstation } from "./workstation-roster.js";
export type { PlacementChange, ProductStation } from "./product-placements.js";

/** L'état d'une carte, tel qu'un dépôt le relit (`toDomain`). */
export interface WorkstationMapState {
  readonly workstations: readonly Workstation[];
  /** Référence produit → ses postes ; un produit absent est « à ranger ». */
  readonly placements: ReadonlyMap<string, readonly ProductStation[]>;
}

/** Ce qu'un `save` doit écrire : la différence, jamais la carte entière. */
export interface WorkstationMapChanges {
  /** Les postes à réécrire — dont ceux qu'un produit vient de quitter. */
  readonly workstations: readonly Workstation[];
  readonly placements: readonly PlacementChange[];
}

/** Ce qu'un ajout de poste a changé. */
export interface WorkstationAdded {
  /** Les produits qui ont gagné ce poste. */
  readonly products: readonly string[];
  /** Parmi eux, ceux qui n'avaient aucun poste : celui-ci les finit. */
  readonly finishing: readonly string[];
}

/** Ce qu'un retrait de poste a changé. */
export interface WorkstationRemoved {
  /** Les produits qui ont perdu ce poste. */
  readonly products: readonly string[];
  /** Parmi eux, ceux qui n'ont plus aucun poste : « à ranger ». */
  readonly unplaced: readonly string[];
}

/**
 * **La carte des postes du fournil** : ses postes et les postes de chaque
 * produit (décisions de Hugo, 2026-11-16 et 2026-11-25 — un produit peut
 * passer par plusieurs postes, un seul le finit ; ses déclinaisons en
 * héritent).
 *
 * Un agrégat, parce que ses règles refusent une écriture et se jugent sur
 * l'ensemble : deux postes en service ne portent pas le même nom, un poste
 * qui porte des produits ne s'archive pas, aucun produit ne va sur un poste
 * archivé, et **un produit placé a exactement un poste qui finit** — la base
 * tient « au plus un » (index partiel), la carte tient « au moins un ».
 *
 * La carte retient ce qu'elle a changé (`changes`) : le dépôt n'écrit que la
 * différence. Un poste qu'un produit quitte est réécrit à l'instant du
 * geste : une ligne supprimée ne bougerait pas le numéro de la carte
 * (`WorkstationMapVersion`, le plus récent `updated_at`), et la fiche gardée
 * resterait celle d'avant.
 */
export class WorkstationMap extends WorkstationRoster {
  private readonly placed: ProductPlacements;

  private constructor(state: WorkstationMapState) {
    super(state.workstations);
    this.placed = new ProductPlacements(state.placements);
  }

  /** Personne n'a encore rien réglé. */
  static empty(): WorkstationMap {
    return new WorkstationMap({ workstations: [], placements: new Map() });
  }

  /** La carte relue en base : ses noms ont déjà été validés à l'écriture. */
  static rehydrate(state: WorkstationMapState): WorkstationMap {
    return new WorkstationMap(state);
  }

  /** Le poste qui finit le produit ; `null` : « à ranger ». */
  workstationOf(product: string): string | null {
    return this.placed.finisherOf(product);
  }

  /** Les postes du produit, celui qui finit en premier. */
  stationsOf(product: string): readonly ProductStation[] {
    return this.placed.stationsOf(product);
  }

  /** Sa place dans la pile d'un poste (par défaut celui qui le finit) ; `null` : sans ligne, ou jamais réglée. */
  positionOf(product: string, workstationId?: string): number | null {
    const station = workstationId ?? this.placed.finisherOf(product);
    return station === null ? null : (this.placed.slotOf(product, station)?.position ?? null);
  }

  /** Combien de produits ont au moins un poste. */
  placedCount(): number {
    return this.placed.productCount();
  }

  /**
   * « Ces produits sur ce seul poste, qui les finit » ; `null` : remis « à
   * ranger ». Leurs autres postes les quittent. Rend les produits qui ont
   * réellement changé.
   *
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError}
   */
  place(products: readonly ProductSku[], workstationId: string | null): readonly string[] {
    if (workstationId !== null) {
      this.activeStation(workstationId);
    }
    return products.flatMap(({ value: product }) => {
      const stations = this.placed.stationsOf(product);
      if (this.alreadyAlone(stations, workstationId)) {
        return [];
      }
      const kept = workstationId === null ? null : this.placed.slotOf(product, workstationId);
      for (const station of stations) {
        if (station.workstationId !== workstationId) {
          this.leave(product, station.workstationId);
        }
      }
      if (workstationId !== null) {
        const position = kept === null ? this.bottomOf(workstationId) : kept.position;
        this.placed.set(product, workstationId, { finishes: true, position });
      }
      return [product];
    });
  }

  /**
   * Un poste de plus pour ces produits, en bas de sa pile. Le premier poste
   * d'un produit le finit ; les suivants sont des étapes.
   *
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError}
   */
  addWorkstationToProducts(
    products: readonly ProductSku[],
    workstationId: string,
  ): WorkstationAdded {
    this.activeStation(workstationId);
    const added: string[] = [];
    const finishing: string[] = [];
    for (const { value: product } of products) {
      if (this.placed.slotOf(product, workstationId) !== null) {
        continue;
      }
      const finishes = this.placed.stationsOf(product).length === 0;
      this.placed.set(product, workstationId, { finishes, position: this.bottomOf(workstationId) });
      added.push(product);
      if (finishes) {
        finishing.push(product);
      }
    }
    return { products: added, finishing };
  }

  /**
   * Ce poste quitte ces produits. Retirer le dernier poste d'un produit le
   * remet « à ranger » ; retirer celui qui finit alors qu'il en reste
   * d'autres est refusé, pour tout le geste.
   *
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError}
   * @throws {FinishingWorkstationStillNeededError}
   */
  removeWorkstationFromProducts(
    products: readonly ProductSku[],
    workstationId: string,
  ): WorkstationRemoved {
    const station = this.activeStation(workstationId);
    const concerned = products
      .map(({ value }) => value)
      .filter((product) => this.placed.slotOf(product, workstationId) !== null);
    for (const product of concerned) {
      const slot = this.placed.slotOf(product, workstationId);
      if (slot?.finishes === true && this.placed.stationsOf(product).length > 1) {
        throw new FinishingWorkstationStillNeededError(station.name, product);
      }
    }
    const removed = [...new Set(concerned)];
    for (const product of removed) {
      this.leave(product, workstationId);
    }
    const unplaced = removed.filter((product) => this.placed.stationsOf(product).length === 0);
    return { products: removed, unplaced };
  }

  /**
   * Ce poste finit désormais le produit ; celui qui le finissait devient une
   * étape. Rend le poste qui finissait, ou `null` : rien n'a changé.
   *
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError}
   * @throws {WorkstationNotOfProductError} le poste n'est pas encore un poste du produit.
   */
  setFinishingWorkstation(product: ProductSku, workstationId: string): string | null {
    const station = this.activeStation(workstationId);
    const slot = this.placed.slotOf(product.value, workstationId);
    if (slot === null) {
      throw new WorkstationNotOfProductError(station.name, product.value);
    }
    if (slot.finishes) {
      return null;
    }
    const previous = this.placed.finisherOf(product.value);
    if (previous !== null) {
      const before = this.placed.slotOf(product.value, previous);
      this.placed.set(product.value, previous, {
        finishes: false,
        position: before?.position ?? null,
      });
    }
    this.placed.set(product.value, workstationId, { finishes: true, position: slot.position });
    return previous;
  }

  /**
   * **La pile d'un poste** : l'ordre dans lequel le poste voit ses produits —
   * tous ceux qui ont une ligne chez lui, qu'il les finisse ou non.
   * `productSkus` les nomme exactement, chacun une fois, du haut vers le bas.
   * Les places qui ne changent pas ne s'écrivent pas.
   *
   * @throws {WorkstationNotFoundError}
   * @throws {WorkstationArchivedError} un poste archivé ne se règle plus.
   * @throws {WorkstationOrderMismatchError} la liste n'est pas exactement la pile du poste.
   */
  reorderProducts(workstationId: string, productSkus: readonly ProductSku[]): boolean {
    const station = this.activeStation(workstationId);
    const skus = productSkus.map((product) => product.value);
    if (!namesExactly(skus, this.placed.productsOn(workstationId))) {
      throw new WorkstationOrderMismatchError(station.name);
    }
    let moved = false;
    skus.forEach((sku, position) => {
      const slot = this.placed.slotOf(sku, workstationId);
      if (slot !== null && slot.position !== position) {
        this.placed.set(sku, workstationId, { ...slot, position });
        moved = true;
      }
    });
    return moved;
  }

  /** Ce que le dépôt écrit. */
  changes(): WorkstationMapChanges {
    return { workstations: this.changedWorkstations(), placements: this.placed.changes() };
  }

  protected productCountOn(workstationId: string): number {
    return this.placed.productsOn(workstationId).length;
  }

  /** Le produit est déjà sur ce seul poste, qui le finit (ou déjà « à ranger »). */
  private alreadyAlone(stations: readonly ProductStation[], workstationId: string | null): boolean {
    if (workstationId === null) {
      return stations.length === 0;
    }
    const [only] = stations;
    return stations.length === 1 && only?.workstationId === workstationId && only.finishes;
  }

  /** Le poste quitte le produit, et sa ligne de poste est réécrite (le numéro de la carte). */
  private leave(product: string, workstationId: string): void {
    this.placed.remove(product, workstationId);
    if (this.stations.has(workstationId)) {
      this.changedStations.add(workstationId);
    }
  }

  /**
   * La place d'un produit qui arrive sur un poste : **en bas** de sa pile.
   * Tant qu'un produit du poste n'a pas de place réglée, le nouveau n'en a
   * pas non plus : il rejoint la queue sans place, après les places réglées
   * (une place numérotée le ferait passer AU-DESSUS de cette queue).
   */
  private bottomOf(workstationId: string): number | null {
    let last = -1;
    for (const product of this.placed.productsOn(workstationId)) {
      const position = this.placed.slotOf(product, workstationId)?.position ?? null;
      if (position === null) {
        return null;
      }
      last = Math.max(last, position);
    }
    return last + 1;
  }
}
