import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { DeliveryLoadingRoundView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldMeterComponent,
} from 'fold-ng';

import { hasBinToRedo, parisTimeOf, scannedBin } from '../delivery-loading';
import { alreadyLoadedNotice, planBinOf } from '../delivery-loading-notice';
import { loadedBinKeys } from '../delivery-loading-plan';
import { locateBin, outOfRowNotice } from '../delivery-loading-rows';
import { missingByStop } from '../delivery-loading-tiles';
import { roundLabel } from '../delivery-rounds';
import { LoadingGateway } from '../loading-gateway';
import { LoadingNextCard } from '../loading-next-card/loading-next-card';
import { LoadingPlan } from '../loading-plan/loading-plan';
import { loadingPlanLayout } from '../loading-plan-layout';
import { loadingProgressSignals } from '../loading-progress';
import { acceptedLoadNotice, NOT_A_BIN, warningVariant } from '../loading-round-notice';
import { LoadingRoundSource } from '../loading-round-source';
import { LoadingRowPicker } from '../loading-row-picker/loading-row-picker';
import { LoadingRowView } from '../loading-row-view/loading-row-view';
import { LoadingWriteGate } from '../loading-write-gate';
import { neighbourRow } from '../row-swipe';
import { RowSwipeGesture } from '../row-swipe-gesture';

export { loadedNotice } from '../loading-round-notice';

/** « Partir » depuis l'écran de chargement, avec la version lue — ou rien : pas offert ici. */
export type LoadingDeparture = (roundId: string, version: number) => Promise<void>;

/**
 * **Charger UN véhicule** — le corps de l'écran « Charger » (lot 4, L4-C2 ;
 * refonte du handoff « Charger — plan de chargement »), sans sa page.
 *
 * Il répond à la seule question du livreur, dans cet ordre : le bac à poser
 * maintenant (et où), la rangée vue des portes, et le plancher rétrogradé en
 * sélecteur de rangée. Le plan SUGGÈRE : un scan hors ordre charge, puis
 * l'écran explique où va le bac.
 *
 * 🔴 **Ici, le scan EST le geste** : chaque QR lu charge. Le serveur tranche
 * tout le reste, et ses refus s'affichent tels quels.
 *
 * Deux hôtes (PL1) : la page du dépôt (`layout="depot"`, deux colonnes) et
 * « Ma tournée ». Les routes viennent de {@link LoadingGateway}, que l'hôte
 * fournit ; le droit d'écrire et « Partir » sont des entrées. Après le départ,
 * la tournée est gelée : lecture seule.
 */
@Component({
  selector: 'app-loading-round',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldMeterComponent,
    LoadingNextCard,
    LoadingPlan,
    LoadingRowPicker,
    LoadingRowView,
    NgTemplateOutlet,
  ],
  templateUrl: './loading-round.html',
  styleUrl: './loading-round.scss',
})
export class LoadingRound {
  private readonly gateway = inject(LoadingGateway);

  readonly roundId = input.required<string>();
  /** L'hôte tient le droit d'écrire ; la tournée partie l'éteint de toute façon (I6). */
  readonly canWrite = input(false);
  /** « Partir », offert par l'hôte ; `null` : l'écran ne le propose pas. */
  readonly departure = input<LoadingDeparture | null>(null);
  /** Le téléphone du livreur, ou le poste fixe du dépôt (deux colonnes, plus grand). */
  readonly layout = input<'phone' | 'depot'>('phone');
  /** Le bouton de « Tout est chargé » ; `null` : l'hôte n'en offre pas. */
  readonly doneLabel = input<string | null>(null);

  /** Chaque lecture réussie : l'hôte en tire son titre. */
  readonly viewChange = output<DeliveryLoadingRoundView>();
  /** « Tout est chargé », et on s'en va. */
  readonly done = output();

  /** La tournée et son plan, lus puis relus après chaque geste. */
  private readonly source = new LoadingRoundSource(
    () => this.roundId(),
    (view) => this.viewChange.emit(view),
  );
  protected readonly state = this.source.state;
  protected readonly planState = this.source.planState;

  /** Les gestes, un à la fois, chacun suivi d'une relecture. */
  private readonly gate = new LoadingWriteGate(() => this.source.read(this.roundId()));
  /** Le dernier avis : un bac chargé, un bac d'ailleurs, un refus. */
  protected readonly notice = this.gate.notice;
  protected readonly busy = this.gate.busy;
  /** Le code court tapé, quand le QR est illisible. */
  protected readonly typed = signal('');
  /** Le bac désigné d'un toucher, jusqu'au prochain scan. */
  protected readonly picked = signal<string | null>(null);
  /** La rangée figée d'un toucher sur un onglet, jusqu'au prochain scan dans l'ordre. */
  protected readonly pinnedRow = signal<number | null>(null);

  protected readonly view = this.source.view;
  protected readonly plan = this.source.plan;

  protected readonly departed = computed(() => (this.view()?.departedAt ?? null) !== null);
  protected readonly canLoad = computed(
    () => this.canWrite() && this.view() !== null && !this.departed(),
  );
  protected readonly canDepart = computed(() => this.canLoad() && this.departure() !== null);

  /** « Ce qui manque », arrêt par arrêt (SPEC §7) — dépôt comme livreur. */
  protected readonly missingRows = computed(() => {
    const view = this.view();
    return view === null ? [] : missingByStop(view);
  });
  /** Les arrêts qui portent un bac partagé à refaire (v2-4) — dits en alerte. */
  protected readonly toRedoCount = computed(
    () => this.view()?.stops.filter((stop) => hasBinToRedo(stop)).length ?? 0,
  );

  private readonly loaded = computed(() => {
    const view = this.view();
    return view === null ? new Set<string>() : loadedBinKeys(view);
  });

  /** L'avancement : bacs chargés, arrêts à finir, la barre et le mot de la fin. */
  private readonly advance = loadingProgressSignals(this.view, this.plan);
  protected readonly progress = this.advance.progress;
  protected readonly stopsLeftLabel = this.advance.stopsLeftLabel;
  protected readonly railGroups = this.advance.railGroups;
  protected readonly progressPercent = this.advance.progressPercent;
  protected readonly allLoaded = this.advance.allLoaded;
  protected readonly doneSubtitle = this.advance.doneSubtitle;
  /** « Charger · Kangoo blanc » — l'en-tête du téléphone. */
  protected readonly title = computed(() => {
    const vehicle = this.view()?.vehicleName;
    return vehicle === undefined ? 'Charger' : `Charger · ${vehicle}`;
  });

  /** Le plan mis en rangées, piles et onglets ; la rangée ouverte suit le prochain bac. */
  private readonly planLayout = loadingPlanLayout({
    plan: this.plan,
    loaded: this.loaded,
    picked: this.picked,
    pinnedRow: this.pinnedRow,
  });
  protected readonly rows = this.planLayout.rows;
  protected readonly next = this.planLayout.next;
  protected readonly nextKey = this.planLayout.nextKey;
  protected readonly placement = this.planLayout.placement;
  protected readonly openRow = this.planLayout.openRow;
  protected readonly openRowView = this.planLayout.openRowView;
  protected readonly tabs = this.planLayout.tabs;
  protected readonly allColumns = this.planLayout.allColumns;
  protected readonly coldColumns = this.planLayout.coldColumns;
  protected readonly offFloorColumns = this.planLayout.offFloorColumns;

  protected readonly timeOf = parisTimeOf;
  protected readonly warningVariant = warningVariant;

  protected retry(): void {
    this.source.retry();
  }

  protected retryPlan(): void {
    this.source.retryPlan();
  }

  /** Toucher un bac à charger le désigne ; la rangée suit. */
  protected pick(key: string): void {
    this.picked.set(key);
    this.pinnedRow.set(null);
  }

  protected showRow(row: number): void {
    const current = this.openRow();
    this.slideBack.set(current !== null && row < current);
    this.pinnedRow.set(row);
  }

  /** La rangée qui entre glisse dans le sens du doigt : depuis la gauche vers les portes, depuis la droite vers le fond. */
  protected readonly slideBack = signal(false);

  /** Le doigt posé sur la vue de rangée, le temps du geste. */
  private readonly swipe = new RowSwipeGesture();

  protected swipeStart(event: PointerEvent): void {
    this.swipe.start(event);
  }

  protected swipeEnd(event: PointerEvent): void {
    const row = neighbourRow(
      this.rows().map((entry) => entry.row),
      this.openRow(),
      this.swipe.end(event),
    );
    if (row !== null) {
      this.showRow(row);
    }
  }

  protected swipeCancel(): void {
    this.swipe.cancel();
  }

  /** Un QR lu par la caméra, ou un code tapé : c'est le geste. */
  protected async loadFrom(raw: string): Promise<void> {
    const payload = scannedBin(raw);
    if (payload === null) {
      this.notice.set({ variant: 'warning', title: null, text: NOT_A_BIN, showRow: null });
      return;
    }
    const plan = this.plan();
    const entry = plan === null ? null : planBinOf(plan, payload);
    if (entry !== null && this.loaded().has(entry.key)) {
      this.notice.set(alreadyLoadedNotice(entry.bin.code));
      return;
    }
    const openRow = this.openRow();
    const expected = this.nextKey();
    const roundId = this.roundId();
    const accepted = await this.gate.run(
      () => this.gateway.load(roundId, payload),
      'Le bac n’a pas pu être chargé.',
    );
    if (!accepted) {
      return;
    }
    this.typed.set('');
    this.picked.set(null);
    // Dans l'ordre : la rangée suit de nouveau le plan. Sinon, le bac est
    // chargé quand même, et l'écran dit où il va s'il n'est pas d'ici.
    const inOrder = entry !== null && entry.key === expected;
    const location = locateBin(this.rows(), payload);
    const elsewhere = inOrder || openRow === null ? null : outOfRowNotice(location, openRow);
    if (inOrder) {
      this.pinnedRow.set(null);
    }
    this.notice.set(
      acceptedLoadNotice(entry, this.view(), payload, elsewhere, location, this.next()),
    );
  }

  protected unload(binId: string): Promise<boolean> {
    this.picked.set(null);
    const roundId = this.roundId();
    return this.gate.run(
      () => this.gateway.unload(roundId, binId),
      'Le bac n’a pas pu être déchargé.',
    );
  }

  /**
   * « Partir » — refusé par le serveur tant qu'un arrêt n'est pas chargé (Q14,
   * L4-C17) ou porte un bac partagé à refaire (v2-4). Le refus s'affiche tel
   * quel : c'est lui qui nomme le bac et le geste de sortie.
   */
  protected async depart(): Promise<void> {
    const view = this.view();
    const departure = this.departure();
    if (view === null || departure === null) {
      return;
    }
    if (
      await this.gate.run(
        () => departure(view.roundId, view.version),
        'La tournée n’a pas pu partir.',
      )
    ) {
      const text = `${roundLabel(view)} est parti.`;
      this.notice.set({ variant: 'success', title: null, text, showRow: null });
    }
  }
}
