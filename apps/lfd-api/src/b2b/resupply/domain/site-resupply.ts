import { addDays, instantToLocal } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import {
  EmptyResupplyError,
  ResupplyAlreadyPlacedError,
  ResupplyDayPassedError,
  ResupplyLineNotInDraftError,
  ResupplyAlreadyReceivedNotCancellableError,
  ResupplyNotCancellableError,
  BakehouseResupplyAfterStopError,
  ResupplyFrozenInPlanError,
  ResupplyPastCutoffError,
  ResupplyPlanStoppedError,
  SiteResupplyChangedMeanwhileError,
  UnknownResupplyTargetError,
} from "./site-resupply-errors.js";
import { resupplyNameOf } from "./resupply-name.js";
import type { ResupplyOrigin } from "./resupply-origin.js";
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
  /** Qui l'envoie (lot R1d) ; `counter` pour tout ce qui précède. */
  readonly origin: ResupplyOrigin;
  /** Son nom libre (lot R1g) ; `null` : sans nom. */
  readonly name: string | null;
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
 *
 * Depuis R1d, le fournil envoie les siens (`bakehouse`), créés ET envoyés
 * d'un geste : sans brouillon, ils ne touchent jamais la demande du comptoir.
 *
 * Depuis R1g, il porte un nom libre et facultatif (« Vitrine du matin »),
 * posé sur la demande en cours tant qu'elle n'est pas envoyée, ou à l'envoi
 * du fournil ; envoyé, il ne change plus.
 */
export class SiteResupply {
  private constructor(
    readonly id: string,
    readonly siteId: string,
    readonly target: ResupplyTarget,
    readonly serviceDay: string,
    readonly version: number,
    readonly origin: ResupplyOrigin,
    private currentName: string | null,
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
    return SiteResupply.blank(input, input.at, "counter");
  }

  /**
   * « Je t'envoie ça » — le réassort du fournil (lot R1d), créé et envoyé
   * d'un geste : ses lignes (un même article deux fois s'additionne), puis
   * `place` avec les règles du comptoir — au moins une ligne, l'heure limite
   * de sa journée pour « pour demain », et le plan pas encore arrêté (R3a).
   */
  static sentByBakehouse(input: {
    readonly id: string;
    readonly siteId: string;
    readonly target: ResupplyTarget;
    readonly name: string | null;
    readonly lines: readonly SiteResupplyLine[];
    readonly trace: SiteResupplyTrace;
    readonly deadline: Date | null;
    readonly planStopped: boolean;
  }): SiteResupply {
    const resupply = SiteResupply.blank(input, input.trace.at, "bakehouse");
    resupply.rename(input.name);
    for (const line of input.lines) {
      resupply.addLine(line);
    }
    resupply.place(input.trace, input.deadline, input.planStopped);
    return resupply;
  }

  /** Réhydrate un réassort, brouillon compris ; chaque ligne revalide. */
  static restore(snapshot: SiteResupplySnapshot): SiteResupply {
    return new SiteResupply(
      snapshot.id,
      snapshot.siteId,
      snapshot.target,
      snapshot.serviceDay,
      snapshot.version,
      snapshot.origin,
      snapshot.name,
      snapshot.lines.map((line) => SiteResupplyLine.of(line)),
      snapshot.placed,
      snapshot.cancelled,
    );
  }

  /** Un réassort neuf, sans ligne ni geste ; sa journée découle du geste `at`. */
  private static blank(
    input: { readonly id: string; readonly siteId: string; readonly target: ResupplyTarget },
    at: Date,
    origin: ResupplyOrigin,
  ): SiteResupply {
    return new SiteResupply(
      input.id,
      input.siteId,
      input.target,
      serviceDayFor(input.target, at),
      0,
      origin,
      null,
      [],
      null,
      null,
    );
  }

  get name(): string | null {
    return this.currentName;
  }

  /**
   * Nomme la demande en cours (lot R1g) — rogné, vide retire le nom, plus de
   * 60 caractères refusé. Envoyée, elle ne se renomme plus.
   */
  rename(name: string | null): void {
    this.assertDraft();
    this.currentName = resupplyNameOf(name);
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
   * Passe le réassort. `deadline` est l'heure du réassort pour sa journée
   * (« la veille, HH:MM », lot R3a), `null` si elle n'existe pas ce jour-là ;
   * `planStopped` dit si le plan du fournil pour cette journée est arrêté,
   * lu SOUS le verrou de la journée. « Au plus tôt » ignore les deux. La borne
   * est incluse : à la seconde de l'heure, c'est encore accepté. Une demande
   * dont la journée est passée ne s'envoie plus.
   */
  place(trace: SiteResupplyTrace, deadline: Date | null, planStopped: boolean): void {
    this.assertDraft();
    if (this.lineList.length === 0) {
      throw new EmptyResupplyError();
    }
    if (instantToLocal(trace.at).day > this.serviceDay) {
      throw new ResupplyDayPassedError(this.serviceDay);
    }
    if (this.target === "tomorrow") {
      this.assertBeforeStop(trace.at, deadline, planStopped);
    }
    this.placedTrace = trace;
  }

  /** Avant l'heure du réassort ET avant l'arrêt — le message suit qui envoie. */
  private assertBeforeStop(at: Date, deadline: Date | null, planStopped: boolean): void {
    const late = deadline !== null && at > deadline;
    if (!late && !planStopped) {
      return;
    }
    const limit = deadline === null ? null : instantToLocal(deadline);
    const label = limit === null ? "inconnue" : `la veille à ${limit.time}`;
    if (this.origin === "bakehouse") {
      throw new BakehouseResupplyAfterStopError(this.serviceDay, label);
    }
    if (late) {
      throw new ResupplyPastCutoffError(this.serviceDay, label);
    }
    throw new ResupplyPlanStoppedError(this.serviceDay);
  }

  /**
   * Annule un réassort passé. `reception`, lue par l'appelant (`null` avant
   * « Réceptionner ») : arrivé et attesté, il ne s'annule plus (R1d).
   * `planStopped`, lu SOUS le verrou de la journée : un réassort « pour
   * demain » figé dans un plan arrêté ne s'annule plus (R3a, Q3) ; rouvert,
   * il s'annule de nouveau.
   */
  cancel(
    trace: SiteResupplyTrace,
    reception: SiteResupplyTrace | null,
    planStopped: boolean,
  ): void {
    if (this.status !== "placed") {
      throw new ResupplyNotCancellableError();
    }
    if (this.target === "tomorrow" && planStopped) {
      throw new ResupplyFrozenInPlanError(this.serviceDay);
    }
    if (reception !== null) {
      throw new ResupplyAlreadyReceivedNotCancellableError(
        reception.author.name,
        instantToLocal(reception.at).time,
      );
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
