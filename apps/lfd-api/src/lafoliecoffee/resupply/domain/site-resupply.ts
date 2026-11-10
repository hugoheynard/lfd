import {
  ResupplyAlreadyPlacedError,
  SiteResupplyChangedMeanwhileError,
} from "./site-resupply-errors.js";
import { ReserveNotTodayError } from "./site-resupply-gate-errors.js";
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
import { SiteResupplyContent } from "./site-resupply-content.js";
import { SiteResupplyLine } from "./site-resupply-line.js";
import { type ProgressContext, SiteResupplyProgress } from "./site-resupply-progress.js";
import {
  type ResupplyTarget,
  serviceDayFor,
  type SiteResupplyDeparture,
  type SiteResupplyLaunch,
  type SiteResupplySnapshot,
  type SiteResupplyStatus,
} from "./site-resupply-snapshot.js";
import type { ResupplyTrace } from "./resupply-trace.js";
import {
  assertRestorable,
  type CancellationCheck,
  type MountCheck,
  type PlacementCheck,
  UNGATED_PLACEMENT,
} from "./site-resupply-checks.js";

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
} from "./site-resupply-snapshot.js";

/**
 * **Le réassort d'un point de retrait** — ce que le comptoir demande au
 * fournil pour sa vitrine (Hugo 2026-10-21, `reassort-boutiques/README.md`) :
 * jamais une commande, aucun prix, aucune dépendance à `Order`.
 *
 * La journée découle de la visée et de l'instant du geste, à l'heure de
 * Paris : `tomorrow` vise le lendemain, `asap` le jour même. Elle n'est pas
 * saisie, pour qu'un poste à l'horloge fausse ne vise pas un autre jour.
 *
 * Ce que l'agrégat garantit : un article au plus une fois (un second ajout
 * ADDITIONNE sa quantité — le geste naturel en plein service), des quantités
 * entières > 0, au moins une ligne pour passer, l'heure limite opposée à
 * `tomorrow` (jamais à `asap`), une journée pas encore passée à l'envoi, et
 * brouillon → passé → annulé, dans cet ordre seulement. Le nom et les lignes
 * ne changent plus une fois envoyé.
 *
 * Le brouillon est « la demande en cours » du point pour une visée : une
 * seule par (point, visée, journée), tenue par un index unique partiel en
 * base ; les postes le remplissent sous verrou de version. Le fournil et la
 * réserve envoient les leurs créés ET envoyés d'un geste, sans brouillon :
 * ils ne touchent jamais la demande du comptoir.
 */
export class SiteResupply {
  private constructor(
    readonly id: string,
    readonly siteId: string,
    readonly target: ResupplyTarget,
    readonly serviceDay: string,
    /**
     * La version LUE en base (`0` : pas encore écrite), qui n'avance pas en mémoire : l'adaptateur
     * écrit `version + 1`, et un agrégat ne se sauve qu'une fois par unité de travail (2026-11-02).
     */
    readonly version: number,
    readonly origin: ResupplyOrigin,
    private readonly content: SiteResupplyContent,
    private placedTrace: ResupplyTrace | null,
    private cancelledTrace: ResupplyTrace | null,
    private readonly progress: SiteResupplyProgress,
  ) {}

  /** Un brouillon, au geste `at` : sa journée en découle. */
  static draft(input: CounterDraftInput): SiteResupply {
    return SiteResupply.blank(input, input.at, "counter");
  }

  /**
   * « Je t'envoie ça » — le réassort que le fournil crée et envoie d'un geste,
   * sous les règles d'envoi du comptoir (cf. {@link place}).
   */
  static sentByBakehouse(input: BakehouseResupplyInput): SiteResupply {
    const resupply = SiteResupply.blank(input, input.trace.at, "bakehouse");
    resupply.rename(input.name);
    for (const line of input.lines) {
      resupply.addLine(line);
    }
    resupply.place(input.trace, { deadline: input.deadline, planStopped: input.planStopped });
    return resupply;
  }

  /**
   * **« Envoyer en boutique »** — une sortie de la réserve du colisage : le
   * pain est déjà fabriqué, le réassort naît envoyé « au plus tôt » pour la
   * journée du geste, ne se lance ni ne s'annule. Seule la réserve du jour
   * sort (A1.4).
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
    resupply.place(input.trace, UNGATED_PLACEMENT);
    return resupply;
  }

  /**
   * Réhydrate un réassort, brouillon compris ; chaque ligne revalide.
   *
   * @throws {ImpossibleSiteResupplyStateError} un geste d'après l'envoi sur un brouillon.
   */
  static restore(snapshot: SiteResupplySnapshot): SiteResupply {
    assertRestorable(snapshot);
    return new SiteResupply(
      snapshot.id,
      snapshot.siteId,
      snapshot.target,
      snapshot.serviceDay,
      snapshot.version,
      snapshot.origin,
      new SiteResupplyContent(
        snapshot.name,
        snapshot.lines.map((line) => SiteResupplyLine.of(line)),
      ),
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
    const { id, siteId, target } = input;
    const serviceDay = serviceDayFor(target, at);
    const empty = { name: null, lines: [], placed: null, cancelled: null, arrived: null };
    return SiteResupply.restore({ id, siteId, target, serviceDay, version: 0, origin, ...empty });
  }

  get name(): string | null {
    return this.content.name;
  }

  /** Nomme la demande en cours (« Vitrine du matin ») ; envoyée, elle ne se renomme plus. */
  rename(name: string | null): void {
    this.assertDraft();
    this.content.rename(name);
  }

  get lines(): readonly SiteResupplyLine[] {
    return this.content.lines;
  }

  /** Cf. {@link SiteResupplyContent.linesChanged}. */
  get linesChanged(): boolean {
    return this.content.linesChanged;
  }

  get status(): SiteResupplyStatus {
    if (this.cancelledTrace !== null) {
      return "cancelled";
    }
    return this.placedTrace === null ? "draft" : "placed";
  }

  get placed(): ResupplyTrace | null {
    return this.placedTrace;
  }

  get cancelled(): ResupplyTrace | null {
    return this.cancelledTrace;
  }

  get arrived(): ResupplyTrace | null {
    return this.progress.arrived;
  }

  /** « Lancé par X à HH:MM » au fournil, ou `null`. Un affichage, pas une garde. */
  get launched(): SiteResupplyLaunch | null {
    return this.progress.launched;
  }

  /** Cf. {@link SiteResupplyProgress.recordLaunch} : la règle et ses refus. */
  recordLaunch(launch: SiteResupplyLaunch): boolean {
    const launchable =
      this.target === "asap" && this.origin !== "reserve" && this.status === "placed";
    return this.progress.recordLaunch(launchable, launch);
  }

  /** « Parti à HH:MM », ou `null`. Un affichage, pas une garde. */
  get departed(): SiteResupplyDeparture | null {
    return this.progress.departed;
  }

  /** Cf. {@link SiteResupplyProgress.recordDeparture} : la règle et ses refus. */
  recordDeparture(departure: SiteResupplyDeparture): boolean {
    return this.progress.recordDeparture(this.gateContext(), departure);
  }

  /** Cf. {@link SiteResupplyProgress.markArrived} : la règle et ses refus. */
  markArrived(trace: ResupplyTrace, reception: ResupplyTrace | null): boolean {
    return this.progress.markArrived(this.gateContext(), trace, reception);
  }

  /** Cf. {@link SiteResupplyProgress.markMounted} : la règle et ses refus. */
  markMounted(trace: ResupplyTrace, check: MountCheck): boolean {
    return this.progress.markMounted(this.gateContext(), trace, check);
  }

  /** Ajoute un article au brouillon ; cf. `withLineAdded` (somme, unité). */
  addLine(line: SiteResupplyLine): void {
    this.assertDraft();
    this.content.add(line);
  }

  /** Remplace la quantité d'un article du brouillon (entière, un ou plus). */
  correctLine(sku: string, quantity: number): void {
    this.assertDraft();
    this.content.correct(sku, quantity);
  }

  /** Retire un article du brouillon. */
  withdrawLine(sku: string): void {
    this.assertDraft();
    this.content.withdraw(sku);
  }

  /** Refuse un geste posé sur une version que le poste n'a plus sous les yeux. */
  assertSeen(version: number): void {
    if (version !== this.version) {
      throw new SiteResupplyChangedMeanwhileError();
    }
  }

  /** L'envoi qui a suivi `seenVersion`, et lui seul (double clic) : `save` avance la version d'un. */
  isPlacementOf(seenVersion: number): boolean {
    return this.placedTrace !== null && this.version === seenVersion + 1;
  }

  /** Passe le réassort ; `check` est lu SOUS le verrou de la journée (cf. {@link assertPlaceable}). */
  place(trace: ResupplyTrace, check: PlacementCheck): void {
    this.assertDraft();
    const lineCount = this.content.lines.length;
    assertPlaceable({ ...this.gateContext(), ...check, lineCount, at: trace.at });
    this.placedTrace = trace;
  }

  /** « Réceptionner » au point — cf. {@link assertReceivableStatus}, puis `save` sous la version. */
  assertReceivable(): void {
    assertReceivableStatus(this.status);
  }

  /** Annule un réassort passé ; `check` est lu SOUS le verrou de la journée (cf. {@link assertCancellable}). */
  cancel(trace: ResupplyTrace, check: CancellationCheck): void {
    assertCancellable({ ...this.gateContext(), ...check });
    this.cancelledTrace = trace;
  }

  /** Ce que les gardes et le suivi lisent du réassort à l'instant du geste. */
  private gateContext(): ProgressContext {
    const { status, target, serviceDay, origin } = this;
    return { status, target, serviceDay, origin };
  }

  private assertDraft(): void {
    if (this.placedTrace !== null) {
      throw new ResupplyAlreadyPlacedError();
    }
  }
}
