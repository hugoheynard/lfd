import { instantToLocal } from "@lfd/contracts";

import {
  EmptyResupplyError,
  ResupplyAlreadyPlacedError,
  ResupplyDayPassedError,
  ResupplyLineNotInDraftError,
  ResupplyAlreadyReceivedNotCancellableError,
  ResupplyNotCancellableError,
  BakehouseResupplyAfterStopError,
  ResupplyFrozenInPlanError,
  ResupplyLaunchedNotCancellableError,
  ResupplyPastCutoffError,
  ResupplyPlanStoppedError,
  ResupplyNotArrivableError,
  ResupplyNotLaunchedNotMountableError,
  SiteResupplyChangedMeanwhileError,
} from "./site-resupply-errors.js";
import { resupplyNameOf } from "./resupply-name.js";
import type { ResupplyOrigin } from "./resupply-origin.js";
import { SiteResupplyLine } from "./site-resupply-line.js";
import {
  type ResupplyTarget,
  serviceDayFor,
  type SiteResupplyDeparture,
  type SiteResupplyLaunch,
  type SiteResupplySnapshot,
  type SiteResupplyStatus,
  type SiteResupplyTrace,
} from "./site-resupply-snapshot.js";

export {
  isPlaced,
  type PlacedSiteResupplySnapshot,
  type ResupplyTarget,
  resupplyTargetOf,
  serviceDayFor,
  type SiteResupplyDeparture,
  type SiteResupplyLaunch,
  type SiteResupplySnapshot,
  type SiteResupplyStatus,
  type SiteResupplyTrace,
} from "./site-resupply-snapshot.js";

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
    private arrivedTrace: SiteResupplyTrace | null,
    private launchedMark: SiteResupplyLaunch | null = null,
    private departedMark: SiteResupplyDeparture | null = null,
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
      snapshot.arrived,
      snapshot.launched ?? null,
      snapshot.departed ?? null,
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

  get arrived(): SiteResupplyTrace | null {
    return this.arrivedTrace;
  }

  /** « Lancé par X à HH:MM » au fournil (R4a), ou `null`. Un affichage, pas une garde. */
  get launched(): SiteResupplyLaunch | null {
    return this.launchedMark;
  }

  /**
   * **Le fournil l'a lancé** (R4a) — l'affichage, posé par l'abonné au fait
   * `production.resupply_launched`. Seul un « au plus tôt » envoyé se lance ;
   * rejoué, rien ne change.
   *
   * @returns `true` si l'affichage vient d'être posé ; `false` sinon (déjà
   *   posé, ou réassort qui n'est pas un « au plus tôt » envoyé — l'abonné
   *   l'écarte sans relivrer le fait sans fin).
   */
  recordLaunch(launch: SiteResupplyLaunch): boolean {
    if (this.target !== "asap" || this.status !== "placed" || this.launchedMark !== null) {
      return false;
    }
    this.launchedMark = launch;
    return true;
  }

  /** « Parti à HH:MM » (R4d), ou `null`. Un affichage, pas une garde. */
  get departed(): SiteResupplyDeparture | null {
    return this.departedMark;
  }

  /**
   * **La tournée qui porte son transfert est partie** (R4d) — l'affichage,
   * posé par l'abonné au fait `delivery.transfer_departed`. Seul un réassort
   * envoyé part ; rejoué, rien ne change. Aucun refus n'en dépend :
   * « Réceptionner » reste permis avant comme après.
   *
   * @returns `true` si l'affichage vient d'être posé ; `false` sinon.
   */
  recordDeparture(departure: SiteResupplyDeparture): boolean {
    if (this.status !== "placed" || this.departedMark !== null) {
      return false;
    }
    this.departedMark = departure;
    return true;
  }

  /**
   * **« Il est là »** (lot R3e) — le même signal pour les deux chemins : la
   * réception au site du transfert qui le porte, ou « Monté » au fournil.
   * `reception`, lue par l'appelant (`null` avant « Réceptionner »).
   *
   * Refusé sur une demande en cours ou un réassort annulé. Déjà arrivé, ou
   * déjà réceptionné (le comptoir fait foi, il n'attend pas le signal), rien
   * ne change : `false`, et personne ne sonne une seconde fois.
   *
   * @returns `true` si le réassort vient de passer d'attendu à arrivé.
   * @throws {ResupplyNotArrivableError}
   */
  markArrived(trace: SiteResupplyTrace, reception: SiteResupplyTrace | null): boolean {
    if (this.status !== "placed") {
      throw new ResupplyNotArrivableError(this.status === "draft");
    }
    if (this.arrivedTrace !== null || reception !== null) {
      return false;
    }
    this.arrivedTrace = trace;
    return true;
  }

  /**
   * **« Monté »** (R3e) — « il est là » par le geste du fournil. Un « au plus
   * tôt » n'est monté qu'une fois LANCÉ (Q4, R4c) : avant, il n'est pas au
   * plan, rien n'a été fabriqué pour lui. Déjà arrivé ou réceptionné, rien
   * ne change et rien n'est refusé. `launched` est lu au fournil par
   * l'appelant, jamais à la colonne d'affichage du commerce.
   *
   * @returns `true` si le réassort vient de passer d'attendu à arrivé.
   * @throws {ResupplyNotArrivableError} @throws {ResupplyNotLaunchedNotMountableError}
   */
  markMounted(
    trace: SiteResupplyTrace,
    reception: SiteResupplyTrace | null,
    launched: boolean,
  ): boolean {
    const awaited = this.status === "placed" && this.arrivedTrace === null && reception === null;
    if (awaited && this.target === "asap" && !launched) {
      throw new ResupplyNotLaunchedNotMountableError(this.serviceDay);
    }
    return this.markArrived(trace, reception);
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
   * il s'annule de nouveau. `launched`, lu au fournil SOUS le même verrou
   * (R4a) : un « au plus tôt » lancé est au plan, il ne s'annule plus.
   */
  cancel(
    trace: SiteResupplyTrace,
    reception: SiteResupplyTrace | null,
    planStopped: boolean,
    launched: boolean,
  ): void {
    if (this.status !== "placed") {
      throw new ResupplyNotCancellableError();
    }
    if (this.target === "tomorrow" && planStopped) {
      throw new ResupplyFrozenInPlanError(this.serviceDay);
    }
    if (launched) {
      throw new ResupplyLaunchedNotCancellableError(this.serviceDay);
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
