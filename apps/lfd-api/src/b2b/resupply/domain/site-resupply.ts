import { addDays, instantToLocal } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import {
  EmptyResupplyError,
  ResupplyAlreadyPlacedError,
  ResupplyDayPassedError,
  ResupplyLineNotInDraftError,
  ResupplyNotCancellableError,
  ResupplyPastCutoffError,
  SiteResupplyChangedMeanwhileError,
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

/**
 * L'état persisté d'un réassort. Depuis le lot R1c (2026-10-21), le
 * brouillon — « la demande en cours » — se persiste aussi : `placed` est
 * alors `null`.
 */
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
  readonly placed: SiteResupplyTrace | null;
  readonly cancelled: SiteResupplyTrace | null;
}

/** Un réassort envoyé (passé, annulé ou non). */
export type PlacedSiteResupplySnapshot = SiteResupplySnapshot & {
  readonly placed: SiteResupplyTrace;
};

/** Le réassort a-t-il été envoyé ? Un brouillon ne l'a pas été. */
export function isPlaced(snapshot: SiteResupplySnapshot): snapshot is PlacedSiteResupplySnapshot {
  return snapshot.placed !== null;
}

/** La journée qu'une visée désigne à l'instant `at`, à l'heure de Paris. */
export function serviceDayFor(target: ResupplyTarget, at: Date): string {
  const today = instantToLocal(at).day;
  return target === "tomorrow" ? addDays(today, 1) : today;
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
 * Ce que l'agrégat garantit : un article au plus une fois (un second ajout
 * du même article ADDITIONNE sa quantité — le geste naturel en plein
 * service, lot R1c), des quantités entières > 0, au moins une ligne pour
 * passer, l'heure limite opposée à `tomorrow` quand elle s'applique (jamais
 * à `asap`), une journée pas encore passée à l'envoi, et
 * brouillon → passé → annulé, dans cet ordre seulement.
 *
 * Le brouillon est « la demande en cours » du point pour une visée : une
 * seule par (point, visée, journée), tenue par un index unique partiel en
 * base ; les postes le remplissent sous verrou de version.
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
    const serviceDay = serviceDayFor(input.target, input.at);
    return new SiteResupply(input.id, input.siteId, input.target, serviceDay, 0, [], null, null);
  }

  /** Réhydrate un réassort, brouillon compris ; chaque ligne revalide. */
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

  /**
   * Ajoute un article au brouillon. Déjà présent, sa quantité s'ADDITIONNE :
   * deux postes qui ajoutent des croissants en demandent la somme.
   */
  addLine(line: SiteResupplyLine): void {
    this.assertDraft();
    const existing = this.lineList.find((candidate) => candidate.sku === line.sku);
    if (existing === undefined) {
      this.lineList = [...this.lineList, line];
      return;
    }
    const summed = SiteResupplyLine.of({
      sku: existing.sku,
      label: existing.label,
      quantity: existing.quantity + line.quantity,
    });
    this.lineList = this.lineList.map((candidate) =>
      candidate.sku === line.sku ? summed : candidate,
    );
  }

  /** Remplace la quantité d'un article du brouillon (entière, un ou plus). */
  correctLine(sku: string, quantity: number): void {
    this.assertDraft();
    const existing = this.lineOf(sku);
    const corrected = SiteResupplyLine.of({ sku, label: existing.label, quantity });
    this.lineList = this.lineList.map((candidate) =>
      candidate.sku === sku ? corrected : candidate,
    );
  }

  /** Retire un article du brouillon. */
  withdrawLine(sku: string): void {
    this.assertDraft();
    this.lineOf(sku);
    this.lineList = this.lineList.filter((candidate) => candidate.sku !== sku);
  }

  /**
   * Refuse un geste posé sur une version que le poste n'a plus sous les
   * yeux : deux postes ne s'écrasent pas, même l'un après l'autre.
   */
  assertSeen(version: number): void {
    if (version !== this.version) {
      throw new SiteResupplyChangedMeanwhileError();
    }
  }

  /**
   * Passe le réassort. `deadline` est l'heure limite de sa journée quand le
   * réassort y est soumis, `null` sinon (réglé sans limite, ou aucune limite
   * posée) ; « au plus tôt » l'ignore toujours. La borne est incluse, comme
   * pour une commande : à la seconde de la limite, c'est encore accepté.
   * Une demande dont la journée est passée ne s'envoie plus.
   */
  place(trace: SiteResupplyTrace, deadline: Date | null): void {
    this.assertDraft();
    if (this.lineList.length === 0) {
      throw new EmptyResupplyError();
    }
    if (instantToLocal(trace.at).day > this.serviceDay) {
      throw new ResupplyDayPassedError(this.serviceDay);
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

  private lineOf(sku: string): SiteResupplyLine {
    const line = this.lineList.find((candidate) => candidate.sku === sku);
    if (line === undefined) {
      throw new ResupplyLineNotInDraftError(sku);
    }
    return line;
  }

  private assertDraft(): void {
    if (this.placedTrace !== null) {
      throw new ResupplyAlreadyPlacedError();
    }
  }
}
