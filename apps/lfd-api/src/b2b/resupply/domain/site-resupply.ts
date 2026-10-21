import { addDays, instantToLocal } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import {
  EmptyResupplyError,
  ResupplyAlreadyPlacedError,
  ResupplyLineDuplicatedError,
  ResupplyNotCancellableError,
  ResupplyPastCutoffError,
  UnknownResupplyTargetError,
} from "./site-resupply-errors.js";
import { SiteResupplyLine } from "./site-resupply-line.js";

/** `tomorrow` : la commande du soir pour demain ; `asap` : « au plus tôt », aujourd'hui. */
export type ResupplyTarget = "tomorrow" | "asap";

const TARGETS: readonly ResupplyTarget[] = ["tomorrow", "asap"];

/** La visée relue d'une valeur stockée, refusée si inconnue. */
export function resupplyTargetOf(value: string): ResupplyTarget {
  const target = TARGETS.find((known) => known === value);
  if (target === undefined) {
    throw new UnknownResupplyTargetError(value);
  }
  return target;
}

export type SiteResupplyStatus = "draft" | "placed" | "cancelled";

/** Un geste daté et signé. */
export interface SiteResupplyTrace {
  readonly at: Date;
  readonly author: StaffTrace;
}

/** L'état persisté d'un réassort passé (un brouillon ne se persiste pas). */
export interface SiteResupplySnapshot {
  readonly id: string;
  readonly siteId: string;
  readonly target: ResupplyTarget;
  readonly serviceDay: string;
  readonly version: number;
  readonly lines: readonly {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
  }[];
  readonly placed: SiteResupplyTrace;
  readonly cancelled: SiteResupplyTrace | null;
}

/**
 * **Le réassort d'un point de retrait** — ce que le comptoir demande au
 * fournil pour sa vitrine (lot R1, `reassort-boutiques/plan-reapprovisionnement.md`
 * §12, Hugo 2026-10-21). Modèle B : jamais une commande, aucun prix, aucune
 * dépendance à `Order`.
 *
 * La journée découle de la visée et de l'instant du geste, à l'heure de
 * Paris : `tomorrow` vise le lendemain, `asap` le jour même. Elle n'est pas
 * saisie, pour qu'un poste à l'horloge fausse ne vise pas un autre jour.
 *
 * Ce que l'agrégat garantit : un article au plus une fois, des quantités
 * entières > 0, au moins une ligne pour passer, l'heure limite opposée à
 * `tomorrow` quand elle s'applique (jamais à `asap`), et
 * brouillon → passé → annulé, dans cet ordre seulement.
 */
export class SiteResupply {
  private constructor(
    readonly id: string,
    readonly siteId: string,
    readonly target: ResupplyTarget,
    readonly serviceDay: string,
    readonly version: number,
    private lineList: readonly SiteResupplyLine[],
    private placedTrace: SiteResupplyTrace | null,
    private cancelledTrace: SiteResupplyTrace | null,
  ) {}

  /** Un brouillon, au geste `at` : sa journée en découle. */
  static draft(input: {
    readonly id: string;
    readonly siteId: string;
    readonly target: ResupplyTarget;
    readonly at: Date;
  }): SiteResupply {
    const today = instantToLocal(input.at).day;
    const serviceDay = input.target === "tomorrow" ? addDays(today, 1) : today;
    return new SiteResupply(input.id, input.siteId, input.target, serviceDay, 0, [], null, null);
  }

  /** Réhydrate un réassort passé ; chaque ligne revalide. */
  static restore(snapshot: SiteResupplySnapshot): SiteResupply {
    return new SiteResupply(
      snapshot.id,
      snapshot.siteId,
      snapshot.target,
      snapshot.serviceDay,
      snapshot.version,
      snapshot.lines.map((line) => SiteResupplyLine.of(line)),
      snapshot.placed,
      snapshot.cancelled,
    );
  }

  get lines(): readonly SiteResupplyLine[] {
    return this.lineList;
  }

  get status(): SiteResupplyStatus {
    if (this.cancelledTrace !== null) {
      return "cancelled";
    }
    return this.placedTrace === null ? "draft" : "placed";
  }

  get placed(): SiteResupplyTrace | null {
    return this.placedTrace;
  }

  get cancelled(): SiteResupplyTrace | null {
    return this.cancelledTrace;
  }

  /** Ajoute un article au brouillon. Refusé s'il y est déjà, ou si le réassort est passé. */
  addLine(line: SiteResupplyLine): void {
    this.assertDraft();
    if (this.lineList.some((existing) => existing.sku === line.sku)) {
      throw new ResupplyLineDuplicatedError(line.sku);
    }
    this.lineList = [...this.lineList, line];
  }

  /**
   * Passe le réassort. `deadline` est l'heure limite de sa journée quand le
   * réassort y est soumis, `null` sinon (réglé sans limite, ou aucune limite
   * posée) ; « au plus tôt » l'ignore toujours. La borne est incluse, comme
   * pour une commande : à la seconde de la limite, c'est encore accepté.
   */
  place(trace: SiteResupplyTrace, deadline: Date | null): void {
    this.assertDraft();
    if (this.lineList.length === 0) {
      throw new EmptyResupplyError();
    }
    if (this.target === "tomorrow" && deadline !== null && trace.at > deadline) {
      const limit = instantToLocal(deadline);
      throw new ResupplyPastCutoffError(this.serviceDay, `${limit.day} à ${limit.time}`);
    }
    this.placedTrace = trace;
  }

  /**
   * Annule un réassort passé. Permis tant que rien en aval ne le tient — en
   * R1, rien ne le tient encore : le fournil le lit sans le figer (R3).
   */
  cancel(trace: SiteResupplyTrace): void {
    if (this.status !== "placed") {
      throw new ResupplyNotCancellableError();
    }
    this.cancelledTrace = trace;
  }

  private assertDraft(): void {
    if (this.placedTrace !== null) {
      throw new ResupplyAlreadyPlacedError();
    }
  }
}
