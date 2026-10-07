import { DeliveryRoundDepartedError } from "../errors/delivery-loading-errors.js";
import {
  DeliveryRoundStaleError,
  DeliveryStopClosedError,
  DeliveryStopNotFoundError,
} from "../errors/delivery-round-errors.js";
import { DeliveryRoundReturnedError } from "../errors/delivery-doorstep-errors.js";
import type { PlannedTiming } from "../value-objects/planned-timing.js";
import type {
  DeliveryRoundSnapshot,
  DeliveryRoundState,
  DeliveryStopState,
  DetachedStop,
  RemovedStopState,
  RoundReturn,
} from "./delivery-round-state.js";

/** L'identité d'une tournée : ce qui ne change plus après `open`. */
export type DeliveryRoundIdentity = Omit<
  DeliveryRoundState,
  "stops" | "version" | "updatedAt" | "departedAt" | "driverStaffId" | "returned" | "plannedTiming"
>;

/**
 * **L'état d'une tournée et ses lectures** — le socle de `DeliveryRound`,
 * sorti pour que l'agrégat tienne en fichiers lisibles. Il ne mute rien de
 * lui-même : il porte l'état, les gardes que tous les gestes partagent (I6,
 * I8, la version lue) et la mécanique de version (`touch`). Les gestes vivent
 * dans les sous-classes ; seule `DeliveryRound` se construit.
 */
export abstract class DeliveryRoundBase {
  protected readonly removed: RemovedStopState[] = [];
  protected currentVersion: number;
  protected currentDepartedAt: Date | null;
  protected currentReturn: RoundReturn | null = null;
  protected currentPlannedTiming: PlannedTiming | null = null;

  protected constructor(
    protected readonly state: DeliveryRoundIdentity,
    /** `null` : la tournée vient d'être ouverte, rien n'est encore en base. */
    readonly loadedVersion: number | null,
    protected open: DetachedStop[],
    protected closed: readonly DeliveryStopState[],
    protected currentUpdatedAt: Date,
    departedAt: Date | null,
    protected currentDriverStaffId: string | null,
  ) {
    this.currentVersion = loadedVersion ?? 1;
    this.currentDepartedAt = departedAt;
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
  protected findOpen(stopId: string): { readonly index: number; readonly stop: DetachedStop } {
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
  protected recompose(at: Date): void {
    this.currentPlannedTiming = null;
    this.touch(at);
  }

  /** Le premier changement d'une écriture avance la version ; les suivants non. */
  protected touch(at: Date): void {
    if (this.loadedVersion !== null && this.currentVersion === this.loadedVersion) {
      this.currentVersion = this.loadedVersion + 1;
    }
    this.currentUpdatedAt = at;
  }
}
