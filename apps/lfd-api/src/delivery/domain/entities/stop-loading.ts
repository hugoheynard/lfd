import {
  BinInOtherRoundError,
  BinVoidedError,
  DeliveryBinNotFoundError,
  DeliveryRoundDepartedError,
} from "../errors/delivery-loading-errors.js";
import { loadingStateOf, type StopLoadingState } from "./departure-readiness.js";
import { areConsecutive, isSharedBinToRedo, placesInRound, type StopPlace } from "./shared-bin.js";

/** Par où un bac a été chargé : le QR, ou le code court tapé. */
export type LoadVia = "scan" | "code";

/** Un bac de la commande, tel que le chargement le connaît. */
export interface LoadingBin {
  readonly id: string;
  readonly code: string;
  readonly voided: boolean;
  /**
   * La commande de l'autre moitié NON annulée du même bac physique, quand
   * elle est à une autre commande — un bac PARTAGÉ (v2-4). `null` sinon.
   */
  readonly partnerOrderId: string | null;
}

/** Une ligne de chargement (arrêt, bac). Déchargée : les trois `loaded*` nuls. */
export interface BinLoadState {
  readonly id: string;
  readonly binId: string;
  readonly loadedAt: Date | null;
  readonly loadedBy: string | null;
  readonly loadedVia: LoadVia | null;
  /** Le premier chargement de ce bac dans cet arrêt. */
  readonly createdAt: Date;
}

/** Un chargement effectif — ce que « décharger » rend au journal. */
export interface BinLoadRecord {
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
  /** Les commandes des arrêts vivants de la tournée, dans l'ordre de passage. */
  readonly roundOrderIds: readonly string[];
  /** Tous les bacs de la commande, annulés compris, dans l'ordre de déclaration. */
  readonly bins: readonly LoadingBin[];
  /** Les lignes de chargement de CET arrêt. */
  readonly loads: readonly BinLoadState[];
}

/**
 * **Le chargement d'un arrêt** (plan de tournée, lot 4, L4-C18) — le
 * chargement appartient à l'ARRÊT, pas au bac : un arrêt retiré emporte ses
 * chargements, et la commande recomposée repart de zéro.
 *
 * Invariants tenus ici :
 * - on ne charge que dans la tournée de l'arrêt : un bac d'une autre tournée
 *   est refusé en NOMMANT son véhicule et son jour (L4-C2) ;
 * - ni bac annulé, ni tournée partie (I6) ;
 * - charger deux fois le même bac ne compte qu'une fois (L4-C8) ;
 * - décharger est refusé après le départ.
 *
 * L'écrivain de ses lignes est l'exécution seule (C10) ; l'adaptateur verrouille
 * la tournée en PARTAGE avant de le lire, pour qu'un « Partir » concurrent ne
 * passe pas entre la lecture et l'écriture.
 */
export class StopLoading {
  private readonly loads: Map<string, BinLoadState>;
  private readonly changed = new Set<string>();
  private readonly persisted: ReadonlySet<string>;

  private constructor(private readonly snapshot: StopLoadingSnapshot) {
    this.loads = new Map(snapshot.loads.map((load) => [load.binId, load]));
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
    const live = this.snapshot.bins.filter((bin) => !bin.voided).map((bin) => bin.id);
    const loaded = new Set(
      [...this.loads.values()].filter((load) => load.loadedAt !== null).map((load) => load.binId),
    );
    return loadingStateOf(live, loaded);
  }

  /** Le nombre de bacs non annulés de la commande. */
  get liveBinCount(): number {
    return this.snapshot.bins.filter((bin) => !bin.voided).length;
  }

  /** Au moins un bac chargé dans cet arrêt — ce qui interdit de le déplacer (L4-C5). */
  get hasLoadedBin(): boolean {
    return [...this.loads.values()].some((load) => load.loadedAt !== null);
  }

  /**
   * Cette commande est-elle à l'arrêt juste avant ou juste après le sien, dans
   * la même tournée ? Ce qui permet de partager un bac (v2-4).
   */
  isConsecutiveTo(orderId: string): boolean {
    const places = this.places();
    return areConsecutive(places.get(this.snapshot.orderId) ?? null, places.get(orderId) ?? null);
  }

  /**
   * Les codes des bacs PARTAGÉS non annulés dont l'autre commande n'est plus à
   * un arrêt consécutif de cette tournée — « à refaire » (v2-4). Calculé,
   * jamais écrit : voir `shared-bin.ts`.
   */
  get binsToRedo(): readonly string[] {
    const places = this.places();
    const own = places.get(this.snapshot.orderId) ?? null;
    return this.snapshot.bins
      .filter(
        (bin) =>
          !bin.voided &&
          bin.partnerOrderId !== null &&
          isSharedBinToRedo(own, places.get(bin.partnerOrderId) ?? null),
      )
      .map((bin) => bin.code);
  }

  isLoaded(binId: string): boolean {
    return (this.loads.get(binId)?.loadedAt ?? null) !== null;
  }

  /**
   * Charge un bac dans cet arrêt. Rend `false` s'il y était déjà : rien ne
   * s'écrit, rien ne se compte deux fois.
   *
   * `loadId` sert si le bac n'a encore jamais été chargé ici ; une ligne
   * déchargée est réutilisée.
   *
   * @throws {BinInOtherRoundError} @throws {DeliveryRoundDepartedError}
   * @throws {BinVoidedError} @throws {DeliveryBinNotFoundError}
   */
  load(input: {
    readonly roundId: string;
    readonly binId: string;
    readonly loadId: string;
    readonly via: LoadVia;
    readonly by: string;
    readonly at: Date;
  }): boolean {
    const bin = this.gesture(input.roundId, input.binId);
    if (bin.voided) {
      throw new BinVoidedError(bin.code);
    }
    if (this.isLoaded(bin.id)) {
      return false;
    }
    const existing = this.loads.get(bin.id);
    this.write({
      id: existing?.id ?? input.loadId,
      createdAt: existing?.createdAt ?? input.at,
      binId: bin.id,
      loadedAt: input.at,
      loadedBy: input.by,
      loadedVia: input.via,
    });
    return true;
  }

  /**
   * Décharge un bac : sa ligne reste, ses trois `loaded*` redeviennent nuls.
   * Rend le chargement effacé — le journal garde qui avait chargé — ou `null`
   * s'il n'était pas chargé ici : rien ne s'écrit.
   *
   * @throws {BinInOtherRoundError} @throws {DeliveryRoundDepartedError}
   * @throws {DeliveryBinNotFoundError}
   */
  unload(input: { readonly roundId: string; readonly binId: string }): BinLoadRecord | null {
    const bin = this.gesture(input.roundId, input.binId);
    const current = this.loads.get(bin.id);
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

  /** Le code d'un bac de la commande. @throws {DeliveryBinNotFoundError} */
  codeOf(binId: string): string {
    return this.binOf(binId).code;
  }

  /** Cette ligne existait-elle à la lecture ? Sinon, elle est neuve. */
  isPersisted(loadId: string): boolean {
    return this.persisted.has(loadId);
  }

  /** Les lignes changées par ce geste — ce que l'adaptateur écrit. */
  changedLoads(): readonly BinLoadState[] {
    return [...this.changed].flatMap((binId) => {
      const load = this.loads.get(binId);
      return load === undefined ? [] : [load];
    });
  }

  /** Le geste vise-t-il cet arrêt, encore au dépôt ? */
  private gesture(roundId: string, binId: string): LoadingBin {
    const bin = this.binOf(binId);
    if (roundId !== this.snapshot.roundId) {
      throw new BinInOtherRoundError(bin.code, this.snapshot);
    }
    if (this.departed) {
      throw new DeliveryRoundDepartedError(this.snapshot.vehicleName, this.snapshot.serviceDay);
    }
    return bin;
  }

  private places(): ReadonlyMap<string, StopPlace> {
    return placesInRound(this.snapshot.roundId, this.snapshot.roundOrderIds);
  }

  private binOf(binId: string): LoadingBin {
    const bin = this.snapshot.bins.find((candidate) => candidate.id === binId);
    if (bin === undefined) {
      throw new DeliveryBinNotFoundError(binId);
    }
    return bin;
  }

  private write(load: BinLoadState): void {
    this.loads.set(load.binId, load);
    this.changed.add(load.binId);
  }
}
