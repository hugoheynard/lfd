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
  InvalidStopPositionError,
  OrderAlreadyInRoundError,
  VehicleInactiveOnDayError,
} from "../errors/delivery-round-errors.js";
import { DriverWithoutAccessError } from "../errors/delivery-driver-errors.js";
import {
  DeliveryRoundReturnedError,
  DoorstepRoundNotDepartedError,
  RoundNotDepartedForReturnError,
  RoundStopsWithoutOutcomeError,
} from "../errors/delivery-doorstep-errors.js";
import type { PlannedTiming } from "../value-objects/planned-timing.js";
import { isCalendarDay } from "../value-objects/service-day.js";
import { SharedBinToRedoError } from "../errors/delivery-bin-declaration-errors.js";
import { sharedBinsToRedo, type StopReadiness, unreadyStops } from "./departure-readiness.js";
import type {
  DeliveryRoundSnapshot,
  DeliveryRoundState,
  DeliveryStopState,
  DetachedStop,
  RemovedStopState,
  RoundReturn,
} from "./delivery-round-state.js";
import type { Vehicle } from "./vehicle.js";

export type {
  DeliveryRoundSnapshot,
  DeliveryRoundState,
  DeliveryStopState,
  DetachedStop,
  RemovedStopState,
  RoundReturn,
} from "./delivery-round-state.js";

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
 *   (Q14, L4-C17). **Une exception écrite** (L6-C11) : `closeStop`, le seul
 *   geste permis après le départ — et seulement après ;
 * - **I8** — « Tournée terminée » (`parcours-du-livreur.md`, PL2) : on ne
 *   rentre que d'une tournée partie, une fois ; rentrée, elle n'accepte plus
 *   aucun geste de la porte (`closeStop` compris) ;
 * - **I9** — le LIVREUR ne termine que si chaque arrêt a un sort (`finish`,
 *   `a-la-porte.md` § 10 B4) ; la rentrée par le staff reste permise ;
 * - **I10** — l'horaire prévu (décision Hugo 2026-10-06) ne survit à aucun
 *   changement de ses arrêts : affecter, déplacer, retirer, réordonner
 *   l'effacent. Seul `planTiming`, à l'application d'une proposition, le pose.
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
  private currentReturn: RoundReturn | null = null;
  private currentPlannedTiming: PlannedTiming | null = null;

  private constructor(
    private readonly state: Omit<
      DeliveryRoundState,
      | "stops"
      | "version"
      | "updatedAt"
      | "departedAt"
      | "driverStaffId"
      | "returned"
      | "plannedTiming"
    >,
    /** `null` : la tournée vient d'être ouverte, rien n'est encore en base. */
    readonly loadedVersion: number | null,
    private open: DetachedStop[],
    private closed: readonly DeliveryStopState[],
    private currentUpdatedAt: Date,
    departedAt: Date | null,
    private currentDriverStaffId: string | null,
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
    return new DeliveryRound(identity, null, [], [], input.at, null, null);
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
    const round = new DeliveryRound(
      identity,
      state.version,
      open.map(({ id, orderId }) => ({ id, orderId })),
      closed,
      state.updatedAt,
      state.departedAt,
      state.driverStaffId,
    );
    round.currentReturn = state.returned ?? null;
    round.currentPlannedTiming = state.plannedTiming ?? null;
    return round;
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

  /** Le livreur affecté (MT-D2), l'id d'une fiche staff ; `null` : aucun. */
  get driverStaffId(): string | null {
    return this.currentDriverStaffId;
  }

  /** Rentrée le (PL2), ou `null`. */
  get returnedAt(): Date | null {
    return this.currentReturn?.at ?? null;
  }

  /** L'horaire prévu (I10), ou `null` : jamais calculé, ou effacé par un geste à la main. */
  get plannedTiming(): PlannedTiming | null {
    return this.currentPlannedTiming;
  }

  /**
   * Pose l'horaire que le calcul routier a prévu pour CES arrêts (I10) —
   * `null` : il n'a pas pu le prévoir. Appelé après la dernière retouche des
   * arrêts, sans quoi elle l'effacerait aussitôt. Rien ne change, rien ne s'écrit.
   * @throws {DeliveryRoundDepartedError}
   */
  planTiming(timing: PlannedTiming | null, at: Date): void {
    this.ensureAtDepot();
    const same =
      timing === null
        ? this.currentPlannedTiming === null
        : timing.equals(this.currentPlannedTiming);
    if (same) {
      return;
    }
    this.currentPlannedTiming = timing;
    this.touch(at);
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
   * Affecte une commande : elle s'ajoute en dernier, ou après les `after`
   * premiers arrêts vivants — la place suggérée (CA7), posée en un geste.
   * @throws {OrderAlreadyInRoundError} déjà dans cette tournée.
   * @throws {InvalidStopPositionError} la tournée n'a pas ce rang.
   */
  assign(stopId: string, orderId: string, at: Date, after?: number): void {
    if (after !== undefined && (after < 0 || after > this.open.length)) {
      throw new InvalidStopPositionError(after, this.open.length);
    }
    this.attachAt({ id: stopId, orderId }, at, after ?? this.open.length);
  }

  /** Reçoit un arrêt déplacé (I7), en dernier. @throws {OrderAlreadyInRoundError} */
  attach(stop: DetachedStop, at: Date): void {
    this.attachAt(stop, at, this.open.length);
  }

  private attachAt(stop: DetachedStop, at: Date, after: number): void {
    this.ensureAtDepot();
    if (this.open.some((existing) => existing.orderId === stop.orderId)) {
      throw new OrderAlreadyInRoundError(null, {
        vehicleName: this.state.vehicleName,
        serviceDay: this.state.serviceDay,
        passage: this.state.passage,
      });
    }
    this.open = [...this.open.slice(0, after), stop, ...this.open.slice(after)];
    this.recompose(at);
  }

  /**
   * Détache un arrêt vivant pour un déplacement (I7) — il n'est PAS retiré :
   * la même ligne change de tournée (C11).
   */
  detach(stopId: string, at: Date): DetachedStop {
    this.ensureAtDepot();
    const { index, stop } = this.findOpen(stopId);
    this.open = this.open.filter((_, position) => position !== index);
    this.recompose(at);
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
    this.recompose(at);
    return true;
  }

  /**
   * **Partir** (L4-C4, Q14) : la tournée quitte le dépôt, et plus rien ne s'y
   * compose (I6). Refusé tant qu'un arrêt vivant n'est pas chargé — un arrêt
   * sans bac (« non étiqueté », L4-C17) comme un arrêt dont un bac manque. On
   * ne part pas avec un bac non chargé : on retire d'abord l'arrêt, et le
   * geste se voit.
   *
   * `readiness` dit l'état de chargement de chaque arrêt ; un arrêt vivant
   * qu'il ne cite pas est tenu pour non étiqueté — jamais pour chargé.
   *
   * @throws {DeliveryRoundDepartedError} déjà partie.
   * @throws {EmptyDeliveryRoundError} aucun arrêt vivant : une tournée vide ne part pas.
   * @throws {DeliveryRoundNotReadyError} un arrêt n'est pas chargé ; le refus
   *   liste les références.
   * @throws {SharedBinToRedoError} un bac partagé n'est plus entre deux arrêts
   *   consécutifs (lot 4 bis, v2-4).
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
    const toRedo = sharedBinsToRedo(this.open, readiness);
    if (toRedo.length > 0) {
      throw new SharedBinToRedoError(this.state.vehicleName, toRedo);
    }
    this.currentDepartedAt = at;
    this.touch(at);
  }

  /**
   * **Affecter un livreur** (plan « Ma tournée », MT-D2 v2). Composer, donc
   * refusé une fois partie (I6). Et refusé à qui n'a pas le droit EFFECTIF de
   * conduire (`delivery_driving:write`, rôle et dérogations) : `drivers` est
   * la liste que l'annuaire rend au moment du geste — jamais la clé du rôle.
   *
   * Rend `false` quand c'est déjà lui : la version n'avance pas, rien ne s'écrit.
   * @throws {DeliveryRoundDepartedError} @throws {DriverWithoutAccessError}
   */
  assignDriver(staffId: string, drivers: ReadonlySet<string>, at: Date): boolean {
    this.ensureAtDepot();
    if (!drivers.has(staffId)) {
      throw new DriverWithoutAccessError(this.state.vehicleName);
    }
    if (this.currentDriverStaffId === staffId) {
      return false;
    }
    this.currentDriverStaffId = staffId;
    this.touch(at);
    return true;
  }

  /**
   * Retire le livreur affecté ; rend celui qui l'était, ou `null` s'il n'y en
   * avait pas — rien ne s'écrit alors.
   * @throws {DeliveryRoundDepartedError}
   */
  unassignDriver(at: Date): string | null {
    this.ensureAtDepot();
    const previous = this.currentDriverStaffId;
    if (previous === null) {
      return null;
    }
    this.currentDriverStaffId = null;
    this.touch(at);
    return previous;
  }

  /**
   * **Clore un arrêt** (L6-C11, `a-la-porte.md`, AP-D2) — l'exception
   * écrite à I6 : permis APRÈS le départ seulement. L'arrêt garde la position
   * qu'il avait, les arrêts vivants restants se resserrent en 1..n (I2) ; la
   * numérotation du livreur, figée au départ, ne bouge pas.
   *
   * @throws {DoorstepRoundNotDepartedError} la tournée est au dépôt.
   * @throws {DeliveryRoundReturnedError} elle est déjà rentrée (I8).
   * @throws {DeliveryStopNotFoundError} @throws {DeliveryStopClosedError}
   */
  closeStop(stopId: string, at: Date): void {
    if (this.currentDepartedAt === null) {
      throw new DoorstepRoundNotDepartedError();
    }
    this.ensureOnTheRoad();
    const { index, stop } = this.findOpen(stopId);
    this.open = this.open.filter((_, position) => position !== index);
    this.closed = [...this.closed, { ...stop, position: index + 1, closedAt: at }];
    this.touch(at);
  }

  /**
   * **« Tournée terminée »** (`parcours-du-livreur.md`, PL2, I8) : les bacs
   * vides sont rentrés. Seulement partie ; une fois — un second appel rend
   * `false` et n'écrit rien, le premier retour fait foi. Les arrêts encore
   * ouverts le restent : rien ne se clôt tout seul. Appelé seul, c'est la
   * rentrée du STAFF ; le livreur passe par `finish` (I9).
   *
   * @throws {RoundNotDepartedForReturnError} la tournée n'est pas partie.
   */
  returnToDepot(at: Date, by: { readonly staffUserId: string; readonly name: string }): boolean {
    if (this.currentDepartedAt === null) {
      throw new RoundNotDepartedForReturnError(this.state.vehicleName);
    }
    if (this.currentReturn !== null) {
      return false;
    }
    this.currentReturn = { at, byStaffId: by.staffUserId, byName: by.name };
    this.touch(at);
    return true;
  }

  /**
   * **« Tournée terminée » par le LIVREUR** (`a-la-porte.md`, § 10 B4,
   * I9) : refusée tant qu'un arrêt est vivant. Tout sort — remis, déposé,
   * clos sans remise, rapporté par un commercial ou par réglage — passe par
   * `closeStop` ; un arrêt seulement signalé, ou qui attend la décision du
   * commercial, est encore vivant. Le refus nomme les arrêts par `labels`
   * (commande → « Client (CMD-1) »).
   *
   * Une tournée déjà rentrée rend `false` sans rien vérifier : le premier
   * retour fait foi, même celui du staff avec des arrêts ouverts. La rentrée
   * staff (`returnToDepot` seul) n'est pas soumise à cette règle : c'est la
   * sortie de secours d'un livreur bloqué, et ses arrêts sans sort passent
   * dans « Non remis » (AP-D7).
   *
   * @throws {RoundNotDepartedForReturnError} @throws {RoundStopsWithoutOutcomeError}
   */
  finish(
    at: Date,
    by: { readonly staffUserId: string; readonly name: string },
    labels: ReadonlyMap<string, string>,
  ): boolean {
    if (this.currentDepartedAt !== null && this.currentReturn === null && this.open.length > 0) {
      throw new RoundStopsWithoutOutcomeError(
        this.open.map((stop) => labels.get(stop.orderId) ?? stop.orderId),
      );
    }
    return this.returnToDepot(at, by);
  }

  /**
   * Une tournée rentrée n'accepte plus aucun geste de la porte (I8).
   * @throws {DeliveryRoundReturnedError}
   */
  ensureOnTheRoad(): void {
    if (this.currentReturn !== null) {
      throw new DeliveryRoundReturnedError();
    }
  }

  /** L'arrêt est-il clos ? Un nouvel essai après une perte de réseau le demande. */
  hasClosed(stopId: string): boolean {
    return this.closed.some((stop) => stop.id === stopId);
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
      driverStaffId: this.currentDriverStaffId,
      returned: this.currentReturn,
      plannedTiming: this.currentPlannedTiming,
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

  /** Les arrêts ont changé : l'horaire prévu ne vaut plus (I10). */
  private recompose(at: Date): void {
    this.currentPlannedTiming = null;
    this.touch(at);
  }

  /** Le premier changement d'une écriture avance la version ; les suivants non. */
  private touch(at: Date): void {
    if (this.loadedVersion !== null && this.currentVersion === this.loadedVersion) {
      this.currentVersion = this.loadedVersion + 1;
    }
    this.currentUpdatedAt = at;
  }
}
