import type { BillingAddressPayload, FulfillmentMethod, FulfillmentWindow } from "@lfd/contracts";

import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import type { OccurrenceRefusalCause } from "../../../occurrence/domain/refusal-cause.js";
import {
  PlannedColumnAlreadySettledError,
  PlannedColumnBeyondHorizonError,
  PlannedColumnFrozenError,
  PlannedColumnInPastError,
  PlannedColumnWithoutCompanyError,
} from "../errors/planned-column-errors.js";
import { PlannedLine } from "../value-objects/planned-line.js";
import { normalizeRouting, sameRouting } from "../value-objects/planned-routing.js";

/** Combien de jours à l'avance une colonne peut être préparée (Q5, Hugo, 2026-11-27). */
export const PLANNING_HORIZON_DAYS = 28;

/**
 * Les états d'une colonne :
 *
 * - `draft` : un brouillon, qui ne réserve rien ;
 * - `placed` : convertie, elle porte sa commande ;
 * - `refused` : la passation l'a refusée — définitif, le staff reprend la main ;
 * - `missed` : sa fermeture est passée sans conversion ;
 * - `withdrawn` : le client l'a retirée avant le gel — elle reste en base et
 *   libère son créneau.
 */
export type PlannedColumnStatus = "draft" | "placed" | "refused" | "missed" | "withdrawn";

/** L'acheminement d'une colonne, recopié à chaque écriture. */
export interface PlannedRouting {
  readonly method: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddressId: string | null;
  readonly window: FulfillmentWindow;
}

/** Ce qu'une colonne a reçu de la passation quand elle a été refusée. */
export interface PlannedColumnRefusal {
  readonly cause: OccurrenceRefusalCause;
  readonly reason: string;
}

/**
 * L'instant où l'on juge : l'horloge, et le jour de Paris qui lui correspond.
 * L'agrégat ne lit pas l'heure, il juge avec celle qu'on lui passe.
 */
export interface PlannedColumnMoment {
  readonly now: Date;
  readonly today: IsoDate;
}

/** L'état d'une colonne, tel qu'il s'écrit (aucun type Prisma). */
export interface PlannedColumnSnapshot {
  readonly id: string;
  readonly buyerUserId: string;
  readonly companyId: string;
  readonly serviceDay: IsoDate;
  readonly routing: PlannedRouting;
  readonly lines: readonly PlannedLine[];
  readonly status: PlannedColumnStatus;
  readonly convertsAt: Date | null;
  readonly orderId: string | null;
  readonly refusal: PlannedColumnRefusal | null;
  /** La version lue ; `0` pour une colonne pas encore écrite. */
  readonly version: number;
}

/** Ce qu'il faut pour ouvrir une colonne. */
export interface OpenPlannedColumnInput {
  readonly id: string;
  readonly buyerUserId: string;
  readonly companyId: string;
  readonly serviceDay: IsoDate;
  readonly routing: PlannedRouting;
}

/**
 * **Une colonne planifiée** : un brouillon de commande pour une société (un site est une société), un jour
 * servi et un créneau (`routing.window`). Un jour peut en porter plusieurs,
 * une par créneau (Hugo, 2026-11-27) ; chacune donnera au plus une commande.
 *
 * Elle ne s'écrit qu'en brouillon, et avant son instant de conversion : au-delà,
 * la commande porterait autre chose que ce que l'écran a montré (règle 6). Une
 * colonne ne reçoit qu'une issue, une fois.
 */
export class PlannedColumn {
  private constructor(private state: PlannedColumnSnapshot) {}

  /**
   * Ouvre une colonne vide pour un jour à venir, dans l'horizon.
   *
   * @throws {PlannedColumnWithoutCompanyError} aucune société.
   * @throws {PlannedColumnInPastError} le jour est passé.
   * @throws {PlannedColumnBeyondHorizonError} le jour dépasse l'horizon.
   * @throws {InvalidPlannedRoutingError} une livraison sans adresse.
   */
  static open(input: OpenPlannedColumnInput, today: IsoDate): PlannedColumn {
    if (input.companyId.trim() === "") {
      throw new PlannedColumnWithoutCompanyError();
    }
    ensureWithinHorizon(input.serviceDay, today);
    return new PlannedColumn({
      ...input,
      routing: normalizeRouting(input.routing),
      lines: [],
      status: "draft",
      convertsAt: null,
      orderId: null,
      refusal: null,
      version: 0,
    });
  }

  /** Relit une colonne écrite : ses lignes ont déjà été jugées. */
  static reconstitute(snapshot: PlannedColumnSnapshot): PlannedColumn {
    return new PlannedColumn(snapshot);
  }

  get id(): string {
    return this.state.id;
  }

  get serviceDay(): IsoDate {
    return this.state.serviceDay;
  }

  get version(): number {
    return this.state.version;
  }

  get isWithdrawn(): boolean {
    return this.state.status === "withdrawn";
  }

  get isNew(): boolean {
    return this.state.version === 0;
  }

  get isDraft(): boolean {
    return this.state.status === "draft";
  }

  get hasLines(): boolean {
    return this.state.lines.length > 0;
  }

  get convertsAt(): Date | null {
    return this.state.convertsAt;
  }

  snapshot(): PlannedColumnSnapshot {
    return this.state;
  }

  /**
   * Remplace toutes les lignes. Rend `false` quand rien ne change : la même
   * colonne réécrite n'est pas une écriture.
   *
   * @throws {PlannedColumnFrozenError} plus en brouillon, ou instant de conversion atteint.
   * @throws {PlannedColumnInPastError} le jour est passé.
   * @throws {DuplicatePlannedLineError} un article y figure deux fois.
   */
  replaceLines(lines: readonly PlannedLine[], moment: PlannedColumnMoment): boolean {
    this.ensureEditable(moment);
    const next = PlannedLine.column(lines);
    if (sameLines(this.state.lines, next)) {
      return false;
    }
    this.state = { ...this.state, lines: next };
    return true;
  }

  /**
   * Change l'acheminement de la colonne. Rend `false` quand rien ne change.
   *
   * @throws {PlannedColumnFrozenError} plus en brouillon, ou instant de conversion atteint.
   * @throws {PlannedColumnInPastError} le jour est passé.
   * @throws {InvalidPlannedRoutingError} une livraison sans adresse.
   */
  reroute(routing: PlannedRouting, moment: PlannedColumnMoment): boolean {
    this.ensureEditable(moment);
    const next = normalizeRouting(routing);
    if (sameRouting(this.state.routing, next)) {
      return false;
    }
    this.state = { ...this.state, routing: next };
    return true;
  }

  /**
   * La personne qui écrit la colonne devient son acheteur : c'est elle que la
   * conversion fera commander (mur rejoué à la passation).
   */
  writtenBy(userId: string): void {
    this.state = { ...this.state, buyerUserId: userId };
  }

  /**
   * Retire la colonne, tant qu'elle est en brouillon et avant son gel. Rend
   * `false` si elle l'était déjà : retirer deux fois ne refait rien.
   *
   * @throws {PlannedColumnFrozenError} plus en brouillon, ou instant de conversion atteint.
   */
  withdraw(moment: PlannedColumnMoment): boolean {
    if (this.state.status === "withdrawn") {
      return false;
    }
    this.ensureEditable(moment);
    this.state = { ...this.state, status: "withdrawn" };
    return true;
  }

  /**
   * Pose l'instant de conversion — celui du gel (règle 6) —, calculé à chaque
   * écriture et redemandé à chaque balayage : une limite d'article peut avoir
   * changé depuis. Rend `false` quand rien ne change.
   *
   * @throws {PlannedColumnAlreadySettledError} la colonne a déjà son issue.
   */
  scheduleConversion(at: Date | null): boolean {
    if (this.state.status !== "draft") {
      throw new PlannedColumnAlreadySettledError(this.state.serviceDay.value);
    }
    if (this.state.convertsAt?.getTime() === at?.getTime()) {
      return false;
    }
    this.state = { ...this.state, convertsAt: at };
    return true;
  }

  /** @throws {PlannedColumnAlreadySettledError} la colonne a déjà son issue. */
  markPlaced(orderId: string): void {
    this.settle({ status: "placed", orderId, refusal: null });
  }

  /** Un refus est définitif : la colonne est gelée (Q2). */
  markRefused(refusal: PlannedColumnRefusal): void {
    this.settle({ status: "refused", orderId: null, refusal });
  }

  markMissed(): void {
    this.settle({ status: "missed", orderId: null, refusal: null });
  }

  private settle(outcome: Pick<PlannedColumnSnapshot, "status" | "orderId" | "refusal">): void {
    if (this.state.status !== "draft") {
      throw new PlannedColumnAlreadySettledError(this.state.serviceDay.value);
    }
    this.state = { ...this.state, ...outcome };
  }

  private ensureEditable(moment: PlannedColumnMoment): void {
    const { status, convertsAt, serviceDay } = this.state;
    if (status !== "draft" || (convertsAt !== null && moment.now >= convertsAt)) {
      throw new PlannedColumnFrozenError(serviceDay.value);
    }
    if (serviceDay.isBefore(moment.today)) {
      throw new PlannedColumnInPastError(serviceDay.value);
    }
  }
}

/** Le dernier jour qu'on peut préparer, vu d'aujourd'hui. */
export function lastPlannableDay(today: IsoDate): IsoDate {
  return today.plusDays(PLANNING_HORIZON_DAYS);
}

function ensureWithinHorizon(day: IsoDate, today: IsoDate): void {
  if (day.isBefore(today)) {
    throw new PlannedColumnInPastError(day.value);
  }
  const last = lastPlannableDay(today);
  if (day.isAfter(last)) {
    throw new PlannedColumnBeyondHorizonError(day.value, last.value);
  }
}

function sameLines(a: readonly PlannedLine[], b: readonly PlannedLine[]): boolean {
  return (
    a.length === b.length &&
    a.every((line, index) => {
      const other = b[index];
      return other !== undefined && line.equals(other);
    })
  );
}
