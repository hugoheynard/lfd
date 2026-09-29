import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DeliveryProposalMode, DeliveryRoundProposalView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { DeliveryMap } from '../delivery-map/delivery-map';
import {
  applyPayloadOfPlan,
  colorOf,
  moveStop,
  type PlannedRound,
  type PlanSlot,
  planOf,
  planSummary,
  timingPayloadOf,
  withTimings,
} from '../delivery-planning';
import { type ComposedDay, serviceDayLabel } from '../delivery-rounds';
import { RoundSheet } from '../round-sheet/round-sheet';

import { NotifyService } from '../../notify.service';
import { MODE_OPTIONS, modeLabel, unlocatedReasonLabel } from '../delivery-routing';
import { DeliveryRoutingService } from '../delivery-routing.service';

/** Un geste en vol : un seul à la fois. */
type Phase = 'idle' | 'locating' | 'proposing' | 'applying';

const CONFLICT = 409;
const CHANGED = 'La composition a changé entre-temps : reproposez.';

/** Là où se règlent le départ et le calcul. */
const SETTINGS_LINK = '/livraison/depart';

/**
 * **Le calculateur de tournée** — « Situer les arrêts », « Proposer »,
 * « Appliquer » (`plan-preparation-de-tournee.md`, lot 7) — et, depuis le
 * lot 10 bis, **l'écran « Planifier »** : la carte à gauche, une feuille de
 * route par camionnette à droite, les arrêts qu'on glisse de l'une à l'autre.
 *
 * Proposer est une LECTURE : la proposition s'affiche en aperçu, rien n'est
 * écrit tant qu'on n'a pas appliqué (L7-C6). Glisser un arrêt ne l'est pas
 * davantage : les deux colonnes touchées sont re-chronométrées par le serveur
 * (L10b-C2), qui peut refuser (L10b-C5) — son message s'affiche tel quel.
 * Appliquer renvoie la composition ÉDITÉE, avec les versions lues ; un refus
 * s'affiche tel quel, et la page relit.
 *
 * Les noms, lieux et états viennent de la feuille de route du jour que la page
 * a lue avec la composition, jointe par commande (L10b-C3).
 */
@Component({
  selector: 'app-route-planner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    DeliveryMap,
    RoundSheet,
  ],
  templateUrl: './route-planner.html',
  styleUrl: './route-planner.scss',
})
export class RoutePlanner {
  private readonly routing = inject(DeliveryRoutingService);
  private readonly notify = inject(NotifyService);

  readonly day = input.required<string>();
  /** Les véhicules actifs ce jour-là ; vide si la flotte n'est pas lisible. */
  readonly vehicles = input<readonly FoldSelectOption<string>[]>([]);
  readonly canWrite = input(false);
  /** Une écriture de la page est en vol. */
  readonly disabled = input(false);
  /** La société de chaque commande, quand la feuille de route la connaît. */
  readonly companies = input<ReadonlyMap<string, string>>(new Map());
  readonly canOpenClients = input(false);
  /** Lecture des réglages (`canReadDeliverySettings`) : le mode se préremplit par leur défaut. */
  readonly canReadSettings = input(false);
  /** La composition du jour jointe à sa feuille de route — les noms, les lieux, les tournées gardées. */
  readonly composed = input<ComposedDay | null>(null);

  /** Une proposition appliquée, ou refusée : la page relit. */
  readonly changed = output();

  /** Les véhicules décochés : par défaut aucun, donc tous ceux du jour. */
  private readonly unchecked = signal<ReadonlySet<string>>(new Set());
  protected readonly recomposeAll = signal(false);
  /** `null` : le serveur prend le défaut des réglages (qu'on n'a pas pu lire). */
  protected readonly mode = signal<DeliveryProposalMode | null>(null);
  /** Le défaut lu dans les réglages, pour y revenir à chaque jour. */
  private readonly defaultMode = signal<DeliveryProposalMode | null>(null);
  protected readonly proposal = signal<DeliveryRoundProposalView | null>(null);
  protected readonly phase = signal<Phase>('idle');
  protected readonly refusal = signal<string | null>(null);

  /** La composition affichée, éditée par glisser-déposer. */
  protected readonly plan = signal<readonly PlannedRound[]>([]);
  /** L'arrêt qu'on a pris, le temps du geste. */
  private readonly dragging = signal<PlanSlot | null>(null);
  /** L'arrêt survolé — une ligne ou son repère. */
  protected readonly highlighted = signal<string | null>(null);
  /** Le dernier refus de « chronométrer » : la composition reste, sans heures. */
  protected readonly timingRefusal = signal<string | null>(null);
  /** Les colonnes en cours de chronométrage, et combien d'appels chacune attend. */
  private readonly inflight = signal<ReadonlyMap<string, number>>(new Map());

  protected readonly timing = computed(() => this.inflight().size > 0);
  protected readonly summary = computed(() => planSummary(this.plan()));
  /** Ce qu'« Appliquer » enverrait — vide : rien à appliquer. */
  private readonly applyPayload = computed(() => {
    const proposal = this.proposal();
    return proposal === null ? null : applyPayloadOfPlan(proposal, this.plan());
  });
  protected readonly canApply = computed(
    () => !this.busy() && !this.timing() && (this.applyPayload()?.rounds.length ?? 0) > 0,
  );

  protected readonly busy = computed(() => this.phase() !== 'idle' || this.disabled());

  private readonly chosen = computed(() =>
    this.vehicles()
      .map((vehicle) => vehicle.value)
      .filter((id) => !this.unchecked().has(id)),
  );

  /** Aucun véhicule coché sur une flotte connue : rien à proposer. */
  protected readonly nothingChosen = computed(
    () => this.vehicles().length > 0 && this.chosen().length === 0,
  );

  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly modeLabel = modeLabel;
  protected readonly settingsLink = SETTINGS_LINK;
  protected readonly unlocatedReasonLabel = unlocatedReasonLabel;
  protected readonly dayLabel = computed(() => serviceDayLabel(this.day()));

  constructor() {
    // Un autre jour : la proposition et les choix de l'autre jour ne valent plus.
    effect(() => {
      this.day();
      untracked(() => {
        this.show(null);
        this.refusal.set(null);
        this.unchecked.set(new Set());
        this.recomposeAll.set(false);
        this.mode.set(this.defaultMode());
      });
    });
    effect(() => {
      if (this.canReadSettings()) {
        untracked(() => void this.loadDefaultMode());
      }
    });
  }

  protected isChecked(vehicleId: string): boolean {
    return !this.unchecked().has(vehicleId);
  }

  protected toggle(vehicleId: string, checked: boolean): void {
    const next = new Set(this.unchecked());
    if (checked) {
      next.delete(vehicleId);
    } else {
      next.add(vehicleId);
    }
    this.unchecked.set(next);
  }

  protected companyLink(orderId: string): string | null {
    const company = this.companies().get(orderId);
    return company === undefined || !this.canOpenClients()
      ? null
      : `/comptes-clients/${encodeURIComponent(company)}/informations`;
  }

  protected orderLink(orderId: string): string {
    return `/commandes/${encodeURIComponent(orderId)}`;
  }

  protected async locate(): Promise<void> {
    if (!this.start('locating')) {
      return;
    }
    try {
      await this.routing.locate(this.day());
      this.notify.success('Arrêts situés. Proposez pour voir la répartition.');
      // Une proposition affichée ignorait ces points : on la jette plutôt
      // que de laisser croire qu'elle en tient compte.
      this.show(null);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Les arrêts n’ont pas pu être situés.'));
    } finally {
      this.phase.set('idle');
    }
  }

  protected async propose(): Promise<void> {
    if (this.nothingChosen() || !this.start('proposing')) {
      return;
    }
    const day = this.day();
    try {
      const proposal = await this.routing.propose({
        day,
        vehicleIds: this.vehicles().length === 0 ? null : this.chosen(),
        recomposeAll: this.recomposeAll(),
        mode: this.mode(),
      });
      if (day === this.day()) {
        this.show(proposal);
      }
    } catch (error) {
      this.show(null);
      this.refusal.set(httpErrorMessage(error, 'La proposition n’a pas pu être calculée.'));
    } finally {
      this.phase.set('idle');
    }
  }

  protected async apply(): Promise<void> {
    const payload = this.applyPayload();
    if (payload === null || !this.canApply() || !this.start('applying')) {
      return;
    }
    try {
      await this.routing.apply(payload);
      this.show(null);
      this.notify.success('Proposition appliquée : elle se corrige à la main comme avant.');
    } catch (error) {
      const changed = error instanceof HttpErrorResponse && error.status === CONFLICT;
      // Jamais rejouée : elle écraserait ce qu'un collègue vient de composer.
      if (changed) {
        this.show(null);
      }
      this.refusal.set(
        httpErrorMessage(error, changed ? CHANGED : 'La proposition n’a pas pu être appliquée.'),
      );
    } finally {
      this.phase.set('idle');
      this.changed.emit();
    }
  }

  protected discard(): void {
    this.show(null);
    this.refusal.set(null);
  }

  protected colorOf(key: string): string {
    return colorOf(this.plan(), key);
  }

  protected pick(key: string, index: number): void {
    this.dragging.set({ key, index });
  }

  /**
   * Lâcher un arrêt : la composition change ici, puis les deux colonnes
   * touchées partent au chronométrage. Rien n'est écrit (L10b-C2).
   */
  protected drop(key: string, index: number): void {
    const from = this.dragging();
    this.dragging.set(null);
    if (from === null || this.busy()) {
      return;
    }
    // Le rang visé est compté AVANT le retrait : dans la même colonne, plus bas, il recule d'un.
    const at = from.key === key && index > from.index ? index - 1 : index;
    const next = moveStop(this.plan(), from, { key, index: at });
    if (next === null) {
      return;
    }
    this.plan.set(next);
    void this.retime([...new Set([from.key, key])]);
  }

  private async retime(keys: readonly string[]): Promise<void> {
    const proposal = this.proposal();
    const payload = proposal === null ? null : timingPayloadOf(proposal.day, this.plan(), keys);
    if (payload === null) {
      return;
    }
    this.track(keys, 1);
    this.timingRefusal.set(null);
    try {
      const view = await this.routing.time(payload);
      // Une autre proposition entre-temps : ces heures ne la concernent pas.
      if (proposal === this.proposal()) {
        this.plan.update((plan) => withTimings(plan, payload, view));
      }
    } catch (error) {
      if (proposal === this.proposal()) {
        this.timingRefusal.set(
          httpErrorMessage(error, 'Les nouvelles heures n’ont pas pu être calculées.'),
        );
      }
    } finally {
      this.track(keys, -1);
    }
  }

  private track(keys: readonly string[], delta: 1 | -1): void {
    const next = new Map(this.inflight());
    for (const key of keys) {
      const count = (next.get(key) ?? 0) + delta;
      if (count > 0) {
        next.set(key, count);
      } else {
        next.delete(key);
      }
    }
    this.inflight.set(next);
  }

  protected isTiming(key: string): boolean {
    return this.inflight().has(key);
  }

  /** Une proposition neuve (ou aucune) : la composition éditée repart d'elle. */
  private show(proposal: DeliveryRoundProposalView | null): void {
    this.proposal.set(proposal);
    this.plan.set(proposal === null ? [] : planOf(proposal, this.composed()));
    this.timingRefusal.set(null);
    this.highlighted.set(null);
    this.dragging.set(null);
    // Les tournées gardées n'ont pas d'heures dans la proposition : un seul
    // appel les chronomètre toutes, chargées comprises (composition inchangée),
    // pour qu'une tournée chargée qui arrivera en retard le dise.
    const kept = this.plan()
      .filter((round) => round.kept && round.vehicleId !== '')
      .map((round) => round.key);
    if (kept.length > 0) {
      void this.retime(kept);
    }
  }

  /** Sans les réglages, le serveur prend leur défaut lui-même : rien à inventer ici. */
  private async loadDefaultMode(): Promise<void> {
    try {
      const { defaultMode } = await this.routing.settings();
      this.defaultMode.set(defaultMode);
      if (this.mode() === null) {
        this.mode.set(defaultMode);
      }
    } catch {
      // Le choix reste vide : « Proposer » laisse le serveur appliquer son défaut.
    }
  }

  private start(phase: Exclude<Phase, 'idle'>): boolean {
    if (this.busy()) {
      return false;
    }
    this.phase.set(phase);
    this.refusal.set(null);
    return true;
  }
}
