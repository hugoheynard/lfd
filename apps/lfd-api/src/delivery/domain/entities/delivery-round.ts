import {
  DeliveryRoundDepartedError,
  DeliveryRoundNotReadyError,
  EmptyDeliveryRoundError,
} from "../errors/delivery-loading-errors.js";
import {
  DeliveryRoundCorruptedError,
  DeliveryRoundStaleError,
  DeliveryStopClosedError,
  DeliveryStopNotFoundError,
  InvalidPassageError,
  InvalidServiceDayError,
  InvalidStopOrderError,
  OrderAlreadyInRoundError,
  VehicleInactiveOnDayError,
} from "../errors/delivery-round-errors.js";
import { isCalendarDay } from "../value-objects/service-day.js";
import { type StopReadiness, unreadyStops } from "./departure-readiness.js";
import type { Vehicle } from "./vehicle.js";

/**
 * Un arrêt tel que la tournée le connaît. `closedAt` non nul = clos (livré ou
 * raté, lot 6) : il n'est plus vivant, garde sa position figée, et se
 * réécrit tel quel.
 */
export interface DeliveryStopState {
  readonly id: string;
  readonly orderId: string;
  readonly position: number;
  readonly closedAt: Date | null;
}

/** Un arrêt retiré pendant cette écriture : la ligne reste, `removedAt` posé. */
export interface RemovedStopState extends DeliveryStopState {
  readonly removedAt: Date;
}

/** L'état persisté d'une tournée — ce que `toDomain` réhydrate. Arrêts non retirés seulement. */
export interface DeliveryRoundState {
  readonly id: string;
  readonly serviceDay: string;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly version: number;
  /** Partie le (lot 4, L4-C4), ou `null` : au dépôt. */
  readonly departedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly stops: readonly DeliveryStopState[];
}

/** Ce que l'adaptateur écrit : l'état, plus les arrêts retirés par ce geste. */
export interface DeliveryRoundSnapshot extends DeliveryRoundState {
  readonly removedStops: readonly RemovedStopState[];
}

/** Un arrêt vivant, détaché d'une tournée pour entrer dans une autre (I7). */
export interface DetachedStop {
  readonly id: string;
  readonly orderId: string;
}

/**
 * **Une tournée** — la racine de la composition (plan de tournée, lot 3, C1) :
 * un jour, un véhicule, un passage, et la liste ORDONNÉE de ses arrêts.
 *
 * Invariants tenus ici :
 * - **I2** — les arrêts vivants occupent les positions 1..n, sans trou ni
 *   doublon ; un réordonnancement est une permutation EXACTE ;
 * - **I4** — un arrêt clos ne bouge plus ;
 * - une commande n'est qu'une fois dans une même tournée ;
 * - **I6** — une tournée partie ne se compose plus (lot 4, L4-C4) : affecter,
 *   déplacer, réordonner, retirer sont refusés ; et elle ne part que chargée
 *   (Q14, L4-C17).
 *
 * **I3** (une commande dans au plus une tournée vivante, tous jours
 * confondus) concerne toutes les tournées : c'est la base qui la tient, par un
 * index unique partiel. **I7** (déplacer) touche deux tournées : c'est le
 * service de domaine `moveDeliveryStop`.
 *
 * La `version` avance d'une unité au premier changement d'une écriture ;
 * `loadedVersion` est celle qu'on a lue, que l'adaptateur exige encore en base.
 */
export class DeliveryRound {
  private readonly removed: RemovedStopState[] = [];
  private currentVersion: number;
  private currentDepartedAt: Date | null;

  private constructor(
    private readonly state: Omit<
      DeliveryRoundState,
      "stops" | "version" | "updatedAt" | "departedAt"
    >,
    /** `null` : la tournée vient d'être ouverte, rien n'est encore en base. */
    readonly loadedVersion: number | null,
    private open: DetachedStop[],
    private readonly closed: readonly DeliveryStopState[],
    private currentUpdatedAt: Date,
    departedAt: Date | null,
  ) {
    this.currentVersion = loadedVersion ?? 1;
    this.currentDepartedAt = departedAt;
  }

  /**
   * Ouvre une tournée pour un véhicule, un jour, un passage.
   * @throws {VehicleInactiveOnDayError} le véhicule est retiré avant ce jour (C14).
   * @throws {InvalidPassageError} @throws {InvalidServiceDayError}
   */
  static open(input: {
    readonly id: string;
    readonly serviceDay: string;
    readonly vehicle: Vehicle;
    readonly passage: number;
    readonly at: Date;
  }): DeliveryRound {
    if (!isCalendarDay(input.serviceDay)) {
      throw new InvalidServiceDayError(input.serviceDay);
    }
    if (!input.vehicle.activeOn(input.serviceDay)) {
      throw new VehicleInactiveOnDayError(input.vehicle.name, input.serviceDay);
    }
    if (!Number.isInteger(input.passage) || input.passage < 1) {
      throw new InvalidPassageError(input.passage);
    }
    const identity = {
      id: input.id,
      serviceDay: input.serviceDay,
      vehicleId: input.vehicle.id,
      vehicleName: input.vehicle.name,
      passage: input.passage,
      createdAt: input.at,
    };
    return new DeliveryRound(identity, null, [], [], input.at, null);
  }

  /**
   * Réhydrate une tournée lue en base ; I2 se revérifie.
   * @throws {DeliveryRoundCorruptedError}
   */
  static restore(state: DeliveryRoundState): DeliveryRound {
    const open = state.stops
      .filter((stop) => stop.closedAt === null)
      .sort((a, b) => a.position - b.position);
    if (open.some((stop, index) => stop.position !== index + 1)) {
      throw new DeliveryRoundCorruptedError(state.id);
    }
    const closed = state.stops.filter((stop) => stop.closedAt !== null);
    const identity = {
      id: state.id,
      serviceDay: state.serviceDay,
      vehicleId: state.vehicleId,
      vehicleName: state.vehicleName,
      passage: state.passage,
      createdAt: state.createdAt,
    };
    return new DeliveryRound(
      identity,
      state.version,
      open.map(({ id, orderId }) => ({ id, orderId })),
      closed,
      state.updatedAt,
      state.departedAt,
    );
  }

  get id(): string {
    return this.state.id;
  }

  get serviceDay(): string {
    return this.state.serviceDay;
  }

  get vehicleId(): string {
    return this.state.vehicleId;
  }

  get vehicleName(): string {
    return this.state.vehicleName;
  }

  get passage(): number {
    return this.state.passage;
  }

  get version(): number {
    return this.currentVersion;
  }

  /** Partie le, ou `null` : au dépôt. */
  get departedAt(): Date | null {
    return this.currentDepartedAt;
  }

  /** Les arrêts vivants, dans l'ordre de passage. */
  get liveStops(): readonly DetachedStop[] {
    return [...this.open];
  }

  /** Les identifiants des commandes des arrêts vivants, dans l'ordre de passage. */
  get orderIds(): readonly string[] {
    return this.open.map((stop) => stop.orderId);
  }

  /**
   * La version présentée par l'écran est-elle celle qu'on a lue ?
   * @throws {DeliveryRoundStaleError}
   */
  ensureVersion(expected: number): void {
    if (expected !== this.loadedVersion) {
      throw new DeliveryRoundStaleError(this.state.vehicleName);
    }
  }

  /** La commande d'un arrêt vivant. @throws {DeliveryStopNotFoundError} @throws {DeliveryStopClosedError} */
  orderOf(stopId: string): string {
    return this.findOpen(stopId).stop.orderId;
  }

  /** Position 1..n de l'arrêt vivant. @throws {DeliveryStopNotFoundError} */
  positionOf(stopId: string): number {
    return this.findOpen(stopId).index + 1;
  }

  /**
   * Affecte une commande : elle s'ajoute en dernier.
   * @throws {OrderAlreadyInRoundError} déjà dans cette tournée.
   */
  assign(stopId: string, orderId: string, at: Date): void {
    this.attach({ id: stopId, orderId }, at);
  }

  /** Reçoit un arrêt déplacé (I7), en dernier. @throws {OrderAlreadyInRoundError} */
  attach(stop: DetachedStop, at: Date): void {
    this.ensureAtDepot();
    if (this.open.some((existing) => existing.orderId === stop.orderId)) {
      throw new OrderAlreadyInRoundError(null, {
        vehicleName: this.state.vehicleName,
        serviceDay: this.state.serviceDay,
        passage: this.state.passage,
      });
    }
    this.open = [...this.open, stop];
    this.touch(at);
  }

  /**
   * Détache un arrêt vivant pour un déplacement (I7) — il n'est PAS retiré :
   * la même ligne change de tournée (C11).
   */
  detach(stopId: string, at: Date): DetachedStop {
    this.ensureAtDepot();
    const { index, stop } = this.findOpen(stopId);
    this.open = this.open.filter((_, position) => position !== index);
    this.touch(at);
    return stop;
  }

  /**
   * Retire un arrêt (Q11 : à la main) : la ligne reste, `removedAt` posé, et
   * elle garde la position qu'elle avait — la dernière qu'on lui ait connue.
   */
  remove(stopId: string, at: Date): DetachedStop {
    const position = this.positionOf(stopId);
    const stop = this.detach(stopId, at);
    this.removed.push({ ...stop, position, closedAt: null, removedAt: at });
    return stop;
  }

  /**
   * Range les arrêts vivants dans l'ordre donné. Rend `false` si l'ordre ne
   * change rien — la version n'avance pas, et rien ne s'écrit.
   * @throws {InvalidStopOrderError} pas une permutation exacte (I2).
   * @throws {DeliveryStopClosedError} un arrêt clos y figure (I4).
   */
  reorder(stopIds: readonly string[], at: Date): boolean {
    this.ensureAtDepot();
    const closedId = stopIds.find((id) => this.closed.some((stop) => stop.id === id));
    if (closedId !== undefined) {
      throw new DeliveryStopClosedError(closedId);
    }
    const byId = new Map(this.open.map((stop) => [stop.id, stop]));
    const unique = new Set(stopIds);
    if (unique.size !== stopIds.length || stopIds.length !== this.open.length) {
      throw new InvalidStopOrderError();
    }
    const next = stopIds.map((id) => byId.get(id));
    if (next.some((stop) => stop === undefined)) {
      throw new InvalidStopOrderError();
    }
    if (stopIds.every((id, index) => this.open[index]?.id === id)) {
      return false;
    }
    this.open = next.filter((stop): stop is DetachedStop => stop !== undefined);
    this.touch(at);
    return true;
  }

  /**
   * **Partir** (L4-C4, Q14) : la tournée quitte le dépôt, et plus rien ne s'y
   * compose (I6). Refusé tant qu'un arrêt vivant n'est pas chargé — un arrêt
   * sans sac (« non étiqueté », L4-C17) comme un arrêt dont un sac manque. On
   * ne part pas avec un sac non chargé : on retire d'abord l'arrêt, et le
   * geste se voit.
   *
   * `readiness` dit l'état de chargement de chaque arrêt ; un arrêt vivant
   * qu'il ne cite pas est tenu pour non étiqueté — jamais pour chargé.
   *
   * @throws {DeliveryRoundDepartedError} déjà partie.
   * @throws {EmptyDeliveryRoundError} aucun arrêt vivant : une tournée vide ne part pas.
   * @throws {DeliveryRoundNotReadyError} un arrêt n'est pas chargé ; le refus
   *   liste les références.
   */
  depart(at: Date, readiness: readonly StopReadiness[]): void {
    this.ensureAtDepot();
    if (this.open.length === 0) {
      throw new EmptyDeliveryRoundError(this.state.vehicleName);
    }
    const { unlabelled, partial } = unreadyStops(this.open, readiness);
    if (unlabelled.length > 0 || partial.length > 0) {
      throw new DeliveryRoundNotReadyError(this.state.vehicleName, unlabelled, partial);
    }
    this.currentDepartedAt = at;
    this.touch(at);
  }

  /**
   * Une tournée partie ne se compose plus (I6).
   * @throws {DeliveryRoundDepartedError}
   */
  ensureAtDepot(): void {
    if (this.currentDepartedAt !== null) {
      throw new DeliveryRoundDepartedError(this.state.vehicleName, this.state.serviceDay);
    }
  }

  toSnapshot(): DeliveryRoundSnapshot {
    return {
      ...this.state,
      version: this.currentVersion,
      departedAt: this.currentDepartedAt,
      updatedAt: this.currentUpdatedAt,
      stops: [
        ...this.open.map((stop, index) => ({ ...stop, position: index + 1, closedAt: null })),
        ...this.closed,
      ],
      removedStops: [...this.removed],
    };
  }

  /** @throws {DeliveryStopNotFoundError} @throws {DeliveryStopClosedError} */
  private findOpen(stopId: string): { readonly index: number; readonly stop: DetachedStop } {
    const index = this.open.findIndex((stop) => stop.id === stopId);
    const stop = this.open[index];
    if (stop !== undefined) {
      return { index, stop };
    }
    if (this.closed.some((stop) => stop.id === stopId)) {
      throw new DeliveryStopClosedError(stopId);
    }
    throw new DeliveryStopNotFoundError(stopId);
  }

  /** Le premier changement d'une écriture avance la version ; les suivants non. */
  private touch(at: Date): void {
    if (this.loadedVersion !== null && this.currentVersion === this.loadedVersion) {
      this.currentVersion = this.loadedVersion + 1;
    }
    this.currentUpdatedAt = at;
  }
}
