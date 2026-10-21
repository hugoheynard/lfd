import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import {
  IncompleteStockAlertError,
  StockAlertAlreadyLiftedError,
  UnknownStockAlertLevelError,
  UnknownStockAlertLiftReasonError,
} from "./stock-alert-errors.js";

/** `out_of_stock` : rupture ; `low` : stock faible. */
export type StockAlertLevel = "out_of_stock" | "low";

/** `manual` : le comptoir l'a levée ; `receipt` : un réassort de l'article a été reçu au point. */
export type StockAlertLiftReason = "manual" | "receipt";

const LEVELS: readonly StockAlertLevel[] = ["out_of_stock", "low"];
const LIFT_REASONS: readonly StockAlertLiftReason[] = ["manual", "receipt"];

/** Le niveau relu d'une valeur stockée, refusé s'il est inconnu. */
export function stockAlertLevelOf(value: string): StockAlertLevel {
  const level = LEVELS.find((known) => known === value);
  if (level === undefined) {
    throw new UnknownStockAlertLevelError(value);
  }
  return level;
}

/** La raison de levée relue d'une valeur stockée, refusée si inconnue. */
export function stockAlertLiftReasonOf(value: string): StockAlertLiftReason {
  const reason = LIFT_REASONS.find((known) => known === value);
  if (reason === undefined) {
    throw new UnknownStockAlertLiftReasonError(value);
  }
  return reason;
}

/** Un geste daté et signé. */
export interface StockAlertTrace {
  readonly at: Date;
  readonly author: StaffTrace;
}

/** La levée : qui, quand, pourquoi. */
export interface StockAlertLift extends StockAlertTrace {
  readonly reason: StockAlertLiftReason;
}

/** L'état persisté d'une alerte. */
export interface StockAlertSnapshot {
  readonly id: string;
  readonly siteId: string;
  readonly sku: string;
  readonly label: string;
  readonly level: StockAlertLevel;
  readonly version: number;
  /** La DERNIÈRE déclaration : une redéclaration la remplace. */
  readonly declared: StockAlertTrace;
  readonly lifted: StockAlertLift | null;
}

/**
 * **Une alerte de stock** — « rupture » ou « stock faible » déclarée par le
 * comptoir sur un article, pour un point (lot R1b,
 * `reassort-boutiques/plan-reapprovisionnement.md`, Hugo 2026-10-21).
 *
 * Ce que l'agrégat garantit : une alerte levée ne se rouvre pas et ne se
 * relève pas — sa trace reste (qui, quand, pourquoi), on en déclare une
 * nouvelle. Elle n'a AUCUNE échéance : rien ici ne compare la déclaration à
 * l'horloge, elle ne se lève jamais d'elle-même le lendemain (Hugo : « jusqu'à
 * la réception d'un réassort, ou levée à la main »).
 *
 * « Une seule alerte vivante par (point, article) » ne se voit pas d'un seul
 * agrégat : le handler redéclare l'alerte vivante plutôt que d'en ouvrir une
 * seconde, et un index unique partiel en base refuse la course.
 */
export class StockAlert {
  private constructor(
    readonly id: string,
    readonly siteId: string,
    readonly sku: string,
    readonly label: string,
    readonly version: number,
    private currentLevel: StockAlertLevel,
    private declaredTrace: StockAlertTrace,
    private liftedTrace: StockAlertLift | null,
  ) {}

  /** Déclare une alerte neuve. */
  static declare(input: {
    readonly id: string;
    readonly siteId: string;
    readonly sku: string;
    readonly label: string;
    readonly level: StockAlertLevel;
    readonly trace: StockAlertTrace;
  }): StockAlert {
    const sku = input.sku.trim();
    const label = input.label.trim();
    if (input.siteId.trim() === "" || sku === "" || label === "") {
      throw new IncompleteStockAlertError();
    }
    return new StockAlert(input.id, input.siteId, sku, label, 0, input.level, input.trace, null);
  }

  static restore(snapshot: StockAlertSnapshot): StockAlert {
    return new StockAlert(
      snapshot.id,
      snapshot.siteId,
      snapshot.sku,
      snapshot.label,
      snapshot.version,
      snapshot.level,
      snapshot.declared,
      snapshot.lifted,
    );
  }

  get level(): StockAlertLevel {
    return this.currentLevel;
  }

  get declared(): StockAlertTrace {
    return this.declaredTrace;
  }

  get lifted(): StockAlertLift | null {
    return this.liftedTrace;
  }

  get isLive(): boolean {
    return this.liftedTrace === null;
  }

  /** Redéclare l'alerte vivante : le niveau change, l'auteur et l'instant aussi. */
  redeclare(level: StockAlertLevel, trace: StockAlertTrace): void {
    this.assertLive();
    this.currentLevel = level;
    this.declaredTrace = trace;
  }

  /** Le comptoir lève l'alerte à la main. */
  liftByHand(trace: StockAlertTrace): void {
    this.lift(trace, "manual");
  }

  /** Un réassort de l'article a été reçu au point : l'alerte tombe. */
  liftOnReceipt(trace: StockAlertTrace): void {
    this.lift(trace, "receipt");
  }

  private lift(trace: StockAlertTrace, reason: StockAlertLiftReason): void {
    this.assertLive();
    this.liftedTrace = { ...trace, reason };
  }

  private assertLive(): void {
    if (this.liftedTrace !== null) {
      throw new StockAlertAlreadyLiftedError();
    }
  }
}
