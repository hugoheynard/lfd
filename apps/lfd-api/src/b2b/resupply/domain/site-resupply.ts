import {
  ResupplyAlreadyPlacedError,
  ReserveNotTodayError,
  SiteResupplyChangedMeanwhileError,
} from "./site-resupply-errors.js";
import { resupplyNameOf } from "./resupply-name.js";
import type { ResupplyOrigin } from "./resupply-origin.js";
import {
  assertCancellable,
  assertPlaceable,
  assertReceivableStatus,
} from "./site-resupply-gates.js";
import type {
  BakehouseResupplyInput,
  CounterDraftInput,
  ReserveResupplyInput,
} from "./site-resupply-inputs.js";
import { SiteResupplyLine } from "./site-resupply-line.js";
import { type ProgressContext, SiteResupplyProgress } from "./site-resupply-progress.js";
import { withLineAdded, withLineCorrected, withLineWithdrawn } from "./site-resupply-lines.js";
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
 * fournil pour sa vitrine (lot R1, `reassort-boutiques/README.md`,
 * Hugo 2026-10-21). Modèle B : jamais une commande, aucun prix, aucune
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
  /** Les lignes ont-elles bougé depuis la lecture ? L'adaptateur ne réécrit qu'alors (M4). */
  private linesTouched = false;

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
    private readonly progress: SiteResupplyProgress,
  ) {}

  /** Un brouillon, au geste `at` : sa journée en découle. */
  static draft(input: CounterDraftInput): SiteResupply {
    return SiteResupply.blank(input, input.at, "counter");
  }

  /**
   * « Je t'envoie ça » — le réassort du fournil (lot R1d), créé et envoyé
   * d'un geste : ses lignes (un même article deux fois s'additionne), puis
   * `place` avec les règles du comptoir — au moins une ligne, l'heure limite
   * de sa journée pour « pour demain », et le plan pas encore arrêté (R3a).
   */
  static sentByBakehouse(input: BakehouseResupplyInput): SiteResupply {
    const resupply = SiteResupply.blank(input, input.trace.at, "bakehouse");
    resupply.rename(input.name);
    for (const line of input.lines) {
      resupply.addLine(line);
    }
    resupply.place(input.trace, input.deadline, input.planStopped);
    return resupply;
  }

  /**
   * **« Envoyer en boutique »** — une sortie de la réserve du colisage (plan
   * A1, lot A1.4) : le pain est déjà fabriqué, le réassort naît envoyé « au
   * plus tôt », pour la journée du geste, et ne se lance jamais
   * ({@link recordLaunch}) ni ne s'annule ({@link cancel}). Seule la
   * réserve du jour du geste sort. Ses lignes s'additionnent comme ailleurs ;
   * au moins une.
   *
   * @throws {ReserveNotTodayError} `reserveDay` n'est pas la journée du geste.
   */
  static sentFromReserve(input: ReserveResupplyInput): SiteResupply {
    const today = serviceDayFor("asap", input.trace.at);
    if (input.reserveDay !== today) {
      throw new ReserveNotTodayError(input.reserveDay, today);
    }
    const resupply = SiteResupply.blank({ ...input, target: "asap" }, input.trace.at, "reserve");
    for (const line of input.lines) {
      resupply.addLine(line);
    }
    resupply.place(input.trace, null, false);
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
      new SiteResupplyProgress(
        snapshot.arrived,
        snapshot.launched ?? null,
        snapshot.departed ?? null,
      ),
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
      new SiteResupplyProgress(null, null, null),
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

  /** Vrai si un geste a changé les lignes depuis la réhydratation (ou la création). */
  get linesChanged(): boolean {
    return this.linesTouched;
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
    return this.progress.arrived;
  }

  /** « Lancé par X à HH:MM » au fournil (R4a), ou `null`. Un affichage, pas une garde. */
  get launched(): SiteResupplyLaunch | null {
    return this.progress.launched;
  }

  /** Cf. {@link SiteResupplyProgress.recordLaunch} : la règle et ses refus. */
  recordLaunch(launch: SiteResupplyLaunch): boolean {
    const launchable =
      this.target === "asap" && this.origin !== "reserve" && this.status === "placed";
    return this.progress.recordLaunch(launchable, launch);
  }

  /** « Parti à HH:MM » (R4d), ou `null`. Un affichage, pas une garde. */
  get departed(): SiteResupplyDeparture | null {
    return this.progress.departed;
  }

  /** Cf. {@link SiteResupplyProgress.recordDeparture} : la règle et ses refus. */
  recordDeparture(departure: SiteResupplyDeparture): boolean {
    return this.progress.recordDeparture(this.progressContext(), departure);
  }

  /** Cf. {@link SiteResupplyProgress.markArrived} : la règle et ses refus. */
  markArrived(trace: SiteResupplyTrace, reception: SiteResupplyTrace | null): boolean {
    return this.progress.markArrived(this.progressContext(), trace, reception);
  }

  /** Cf. {@link SiteResupplyProgress.markMounted} : la règle et ses refus. */
  markMounted(
    trace: SiteResupplyTrace,
    reception: SiteResupplyTrace | null,
    launched: boolean,
  ): boolean {
    return this.progress.markMounted(this.progressContext(), trace, reception, launched);
  }

  /** Ajoute un article au brouillon ; cf. {@link withLineAdded} (somme, unité). */
  addLine(line: SiteResupplyLine): void {
    this.assertDraft();
    this.lineList = withLineAdded(this.lineList, line);
    this.linesTouched = true;
  }

  /** Remplace la quantité d'un article du brouillon (entière, un ou plus). */
  correctLine(sku: string, quantity: number): void {
    this.assertDraft();
    this.lineList = withLineCorrected(this.lineList, sku, quantity);
    this.linesTouched = true;
  }

  /** Retire un article du brouillon. */
  withdrawLine(sku: string): void {
    this.assertDraft();
    this.lineList = withLineWithdrawn(this.lineList, sku);
    this.linesTouched = true;
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
   * Passe le réassort. `deadline` (l'heure du réassort pour sa journée, ou
   * `null`) et `planStopped` (lu SOUS le verrou de la journée) : cf.
   * {@link assertPlaceable}.
   */
  place(trace: SiteResupplyTrace, deadline: Date | null, planStopped: boolean): void {
    this.assertDraft();
    assertPlaceable({
      lineCount: this.lineList.length,
      target: this.target,
      origin: this.origin,
      serviceDay: this.serviceDay,
      at: trace.at,
      deadline,
      planStopped,
    });
    this.placedTrace = trace;
  }

  /** « Réceptionner » (G1) — cf. {@link assertReceivableStatus}, puis `save` sous la version. */
  assertReceivable(): void {
    assertReceivableStatus(this.status);
  }

  /**
   * Annule un réassort passé. `reception`, `planStopped` et `launched` sont
   * lus par l'appelant sous le verrou de la journée : cf. {@link assertCancellable}.
   */
  cancel(
    trace: SiteResupplyTrace,
    reception: SiteResupplyTrace | null,
    planStopped: boolean,
    launched: boolean,
  ): void {
    assertCancellable({
      status: this.status,
      origin: this.origin,
      target: this.target,
      serviceDay: this.serviceDay,
      reception,
      planStopped,
      launched,
    });
    this.cancelledTrace = trace;
  }

  private progressContext(): ProgressContext {
    return { status: this.status, target: this.target, serviceDay: this.serviceDay };
  }

  private assertDraft(): void {
    if (this.placedTrace !== null) {
      throw new ResupplyAlreadyPlacedError();
    }
  }
}
