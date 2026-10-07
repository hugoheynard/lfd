import {
  DeliveryRoundCorruptedError,
  InvalidPassageError,
  InvalidServiceDayError,
  InvalidStopOrderError,
  InvalidStopPositionError,
  OrderAlreadyInRoundError,
  DeliveryStopClosedError,
  VehicleInactiveOnDayError,
} from "../errors/delivery-round-errors.js";
import type { DriverAccess } from "../value-objects/driver-access.js";
import type { PlannedTiming } from "../value-objects/planned-timing.js";
import { isCalendarDay } from "../value-objects/service-day.js";
import type { DeliveryRoundIdentity } from "./delivery-round-base.js";
import { DeliveryRoundOnTheRoad } from "./delivery-round-on-the-road.js";
import type { DeliveryRoundState, DetachedStop } from "./delivery-round-state.js";
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
 *
 * L'état, les lectures et les gardes partagées vivent dans
 * `DeliveryRoundBase` ; partir, clore un arrêt et rentrer dans
 * `DeliveryRoundOnTheRoad`. Les trois font UN agrégat : seule cette classe se
 * construit, et les fabriques sont ici.
 */
export class DeliveryRound extends DeliveryRoundOnTheRoad {
  private constructor(
    state: DeliveryRoundIdentity,
    loadedVersion: number | null,
    open: DetachedStop[],
    closed: DeliveryRoundState["stops"],
    updatedAt: Date,
    departedAt: Date | null,
    driverStaffId: string | null,
  ) {
    super(state, loadedVersion, open, closed, updatedAt, departedAt, driverStaffId);
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
   * **Affecter un livreur** (plan « Ma tournée », MT-D2 v2). Composer, donc
   * refusé une fois partie (I6). Et refusé à qui ne peut pas livrer : le droit
   * EFFECTIF de conduire ET celui des gestes à la porte (rôle et dérogations ;
   * audit 2026-10-07, B8) — `access` est ce que l'annuaire rend au moment du
   * geste, jamais la clé du rôle.
   *
   * Rend `false` quand c'est déjà lui : la version n'avance pas, rien ne s'écrit.
   * @throws {DeliveryRoundDepartedError} @throws {DriverWithoutAccessError}
   * @throws {DriverWithoutDoorstepError}
   */
  assignDriver(staffId: string, access: DriverAccess, at: Date): boolean {
    this.ensureAtDepot();
    access.ensureCanDeliver(staffId, this.state.vehicleName);
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
}
