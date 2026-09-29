import {
  BagInOtherRoundError,
  BagVoidedError,
  DeliveryBagNotFoundError,
  DeliveryRoundDepartedError,
} from "../errors/delivery-loading-errors.js";
import { loadingStateOf, type StopLoadingState } from "./departure-readiness.js";

/** Par où un sac a été chargé : le QR, ou le code court tapé. */
export type LoadVia = "scan" | "code";

/** Un sac de la commande, tel que le chargement le connaît. */
export interface LoadingBag {
  readonly id: string;
  readonly code: string;
  readonly voided: boolean;
}

/** Une ligne de chargement (arrêt, sac). Déchargée : les trois `loaded*` nuls. */
export interface BagLoadState {
  readonly id: string;
  readonly bagId: string;
  readonly loadedAt: Date | null;
  readonly loadedBy: string | null;
  readonly loadedVia: LoadVia | null;
  /** Le premier chargement de ce sac dans cet arrêt. */
  readonly createdAt: Date;
}

/** Un chargement effectif — ce que « décharger » rend au journal. */
export interface BagLoadRecord {
  readonly loadedAt: Date;
  readonly loadedBy: string;
  readonly loadedVia: LoadVia;
}

/** L'état persisté du chargement d'UN arrêt vivant. */
export interface StopLoadingSnapshot {
  readonly stopId: string;
  readonly roundId: string;
  readonly orderId: string;
  readonly serviceDay: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly departedAt: Date | null;
  /** Tous les sacs de la commande, annulés compris, dans l'ordre de déclaration. */
  readonly bags: readonly LoadingBag[];
  /** Les lignes de chargement de CET arrêt. */
  readonly loads: readonly BagLoadState[];
}

/**
 * **Le chargement d'un arrêt** (plan de tournée, lot 4, L4-C18) — le
 * chargement appartient à l'ARRÊT, pas au sac : un arrêt retiré emporte ses
 * chargements, et la commande recomposée repart de zéro.
 *
 * Invariants tenus ici :
 * - on ne charge que dans la tournée de l'arrêt : un sac d'une autre tournée
 *   est refusé en NOMMANT son véhicule et son jour (L4-C2) ;
 * - ni sac annulé, ni tournée partie (I6) ;
 * - charger deux fois le même sac ne compte qu'une fois (L4-C8) ;
 * - décharger est refusé après le départ.
 *
 * L'écrivain de ses lignes est l'exécution seule (C10) ; l'adaptateur verrouille
 * la tournée en PARTAGE avant de le lire, pour qu'un « Partir » concurrent ne
 * passe pas entre la lecture et l'écriture.
 */
export class StopLoading {
  private readonly loads: Map<string, BagLoadState>;
  private readonly changed = new Set<string>();
  private readonly persisted: ReadonlySet<string>;

  private constructor(private readonly snapshot: StopLoadingSnapshot) {
    this.loads = new Map(snapshot.loads.map((load) => [load.bagId, load]));
    this.persisted = new Set(snapshot.loads.map((load) => load.id));
  }

  static restore(snapshot: StopLoadingSnapshot): StopLoading {
    return new StopLoading(snapshot);
  }

  get stopId(): string {
    return this.snapshot.stopId;
  }

  get roundId(): string {
    return this.snapshot.roundId;
  }

  get orderId(): string {
    return this.snapshot.orderId;
  }

  get serviceDay(): string {
    return this.snapshot.serviceDay;
  }

  get vehicleName(): string {
    return this.snapshot.vehicleName;
  }

  get passage(): number {
    return this.snapshot.passage;
  }

  get departed(): boolean {
    return this.snapshot.departedAt !== null;
  }

  /** L4-C17 : non étiqueté, partiel, ou chargé. */
  get state(): StopLoadingState {
    const live = this.snapshot.bags.filter((bag) => !bag.voided).map((bag) => bag.id);
    const loaded = new Set(
      [...this.loads.values()].filter((load) => load.loadedAt !== null).map((load) => load.bagId),
    );
    return loadingStateOf(live, loaded);
  }

  /** Le nombre de sacs non annulés de la commande. */
  get liveBagCount(): number {
    return this.snapshot.bags.filter((bag) => !bag.voided).length;
  }

  /** Au moins un sac chargé dans cet arrêt — ce qui interdit de le déplacer (L4-C5). */
  get hasLoadedBag(): boolean {
    return [...this.loads.values()].some((load) => load.loadedAt !== null);
  }

  isLoaded(bagId: string): boolean {
    return (this.loads.get(bagId)?.loadedAt ?? null) !== null;
  }

  /**
   * Charge un sac dans cet arrêt. Rend `false` s'il y était déjà : rien ne
   * s'écrit, rien ne se compte deux fois.
   *
   * `loadId` sert si le sac n'a encore jamais été chargé ici ; une ligne
   * déchargée est réutilisée.
   *
   * @throws {BagInOtherRoundError} @throws {DeliveryRoundDepartedError}
   * @throws {BagVoidedError} @throws {DeliveryBagNotFoundError}
   */
  load(input: {
    readonly roundId: string;
    readonly bagId: string;
    readonly loadId: string;
    readonly via: LoadVia;
    readonly by: string;
    readonly at: Date;
  }): boolean {
    const bag = this.gesture(input.roundId, input.bagId);
    if (bag.voided) {
      throw new BagVoidedError(bag.code);
    }
    if (this.isLoaded(bag.id)) {
      return false;
    }
    const existing = this.loads.get(bag.id);
    this.write({
      id: existing?.id ?? input.loadId,
      createdAt: existing?.createdAt ?? input.at,
      bagId: bag.id,
      loadedAt: input.at,
      loadedBy: input.by,
      loadedVia: input.via,
    });
    return true;
  }

  /**
   * Décharge un sac : sa ligne reste, ses trois `loaded*` redeviennent nuls.
   * Rend le chargement effacé — le journal garde qui avait chargé — ou `null`
   * s'il n'était pas chargé ici : rien ne s'écrit.
   *
   * @throws {BagInOtherRoundError} @throws {DeliveryRoundDepartedError}
   * @throws {DeliveryBagNotFoundError}
   */
  unload(input: { readonly roundId: string; readonly bagId: string }): BagLoadRecord | null {
    const bag = this.gesture(input.roundId, input.bagId);
    const current = this.loads.get(bag.id);
    if (
      current === undefined ||
      current.loadedAt === null ||
      current.loadedBy === null ||
      current.loadedVia === null
    ) {
      return null;
    }
    this.write({ ...current, loadedAt: null, loadedBy: null, loadedVia: null });
    return { loadedAt: current.loadedAt, loadedBy: current.loadedBy, loadedVia: current.loadedVia };
  }

  /** Le code d'un sac de la commande. @throws {DeliveryBagNotFoundError} */
  codeOf(bagId: string): string {
    return this.bagOf(bagId).code;
  }

  /** Cette ligne existait-elle à la lecture ? Sinon, elle est neuve. */
  isPersisted(loadId: string): boolean {
    return this.persisted.has(loadId);
  }

  /** Les lignes changées par ce geste — ce que l'adaptateur écrit. */
  changedLoads(): readonly BagLoadState[] {
    return [...this.changed].flatMap((bagId) => {
      const load = this.loads.get(bagId);
      return load === undefined ? [] : [load];
    });
  }

  /** Le geste vise-t-il cet arrêt, encore au dépôt ? */
  private gesture(roundId: string, bagId: string): LoadingBag {
    const bag = this.bagOf(bagId);
    if (roundId !== this.snapshot.roundId) {
      throw new BagInOtherRoundError(bag.code, this.snapshot);
    }
    if (this.departed) {
      throw new DeliveryRoundDepartedError(this.snapshot.vehicleName, this.snapshot.serviceDay);
    }
    return bag;
  }

  private bagOf(bagId: string): LoadingBag {
    const bag = this.snapshot.bags.find((candidate) => candidate.id === bagId);
    if (bag === undefined) {
      throw new DeliveryBagNotFoundError(bagId);
    }
    return bag;
  }

  private write(load: BagLoadState): void {
    this.loads.set(load.bagId, load);
    this.changed.add(load.bagId);
  }
}
