import { NgTemplateOutlet } from '@angular/common';
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
import type {
  DeliveryLoadingPlanView,
  DeliveryLoadingPlanWarningKind,
  DeliveryLoadingRoundView,
  LoadDeliveryBinPayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
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

import {
  binCountLabel,
  binKindLabel,
  hasBinToRedo,
  parisTimeOf,
  scannedBin,
} from '../delivery-loading';
import {
  alreadyLoadedNotice,
  loadedBinNotice,
  type LoadingNotice,
  planBinOf,
  refusalNotice,
} from '../delivery-loading-notice';
import { loadedBinKeys } from '../delivery-loading-plan';
import {
  currentRow,
  floorRows,
  locateBin,
  nextBin,
  outOfRowNotice,
  placementLine,
  stackTiles,
} from '../delivery-loading-rows';
import {
  missingByStop,
  rowColumns,
  rowTabs,
  rowTitle,
  stackColumns,
} from '../delivery-loading-tiles';
import { roundLabel } from '../delivery-rounds';
import { LoadingGateway } from '../loading-gateway';
import { LoadingNextCard } from '../loading-next-card/loading-next-card';
import { LoadingPlan } from '../loading-plan/loading-plan';
import { LoadingRowPicker } from '../loading-row-picker/loading-row-picker';
import { LoadingRowView } from '../loading-row-view/loading-row-view';
import { neighbourRow, swipeStep } from '../row-swipe';

type RoundState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryLoadingRoundView };

type PlanState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly plan: DeliveryLoadingPlanView };

/** « Partir » depuis l'écran de chargement, avec la version lue — ou rien : pas offert ici. */
export type LoadingDeparture = (roundId: string, version: number) => Promise<void>;

/** Ce qu'on dit d'un code lu qui n'est pas un bac — il n'atteint jamais le réseau. */
const NOT_A_BIN =
  'Ce code ne désigne pas un bac : ni l’adresse d’un bac, ni un code court de six caractères.';

/** Les alertes du plan qui disent un dépassement : en rouge ; les autres en avertissement. */
const ALERT_WARNINGS: ReadonlySet<DeliveryLoadingPlanWarningKind> = new Set([
  'floor_over',
  'dry_over',
  'cold_over',
]);

/** Le bac qu'un chargement accepté désigne, relu dans la tournée : « CMD-12 · bac 2 ». */
export function loadedNotice(
  view: DeliveryLoadingRoundView,
  payload: LoadDeliveryBinPayload,
): string {
  for (const stop of view.stops) {
    const bin = stop.bins.find((candidate) =>
      'binId' in payload ? candidate.binId === payload.binId : candidate.code === payload.code,
    );
    if (bin !== undefined) {
      return `${stop.reference} · ${stop.customerLabel} — bac ${String(bin.index)} (${binKindLabel(bin)}) chargé (${binCountLabel(stop)}).`;
    }
  }
  return 'Bac chargé.';
}

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

  protected readonly state = signal<RoundState>({ status: 'loading' });
  private readonly reload = signal(0);
  protected readonly planState = signal<PlanState>({ status: 'loading' });
  private readonly planReload = signal(0);

  /** Le dernier avis : un bac chargé, un bac d'ailleurs, un refus. */
  protected readonly notice = signal<LoadingNotice | null>(null);
  protected readonly busy = signal(false);
  /** Le code court tapé, quand le QR est illisible. */
  protected readonly typed = signal('');
  /** Le bac désigné d'un toucher, jusqu'au prochain scan. */
  protected readonly picked = signal<string | null>(null);
  /** La rangée figée d'un toucher sur un onglet, jusqu'au prochain scan dans l'ordre. */
  protected readonly pinnedRow = signal<number | null>(null);

  protected readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });
  protected readonly plan = computed(() => {
    const state = this.planState();
    return state.status === 'ready' ? state.plan : null;
  });

  private readonly planKey = computed(() => {
    const view = this.view();
    return view === null ? null : `${view.roundId}@${String(view.version)}`;
  });

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

  /** « 4 / 15 bacs chargés · 5 arrêts à finir ». */
  protected readonly progress = computed(() => {
    const stops = this.view()?.stops ?? [];
    const bins = stops.flatMap((stop) => stop.bins);
    return {
      loaded: bins.filter((bin) => bin.loadedAt !== null).length,
      total: bins.length,
      stops: stops.length,
      stopsLeft: stops.filter((stop) => stop.state !== 'loaded').length,
    };
  });
  protected readonly stopsLeftLabel = computed(() => {
    const left = this.progress().stopsLeft;
    return left === 0 ? 'complet' : `${String(left)} arrêt${left > 1 ? 's' : ''} à finir`;
  });
  protected readonly progressPercent = computed(() => {
    const { loaded, total } = this.progress();
    return total === 0 ? 0 : (loaded / total) * 100;
  });
  /** « Charger · Kangoo blanc » — l'en-tête du téléphone. */
  protected readonly title = computed(() => {
    const vehicle = this.view()?.vehicleName;
    return vehicle === undefined ? 'Charger' : `Charger · ${vehicle}`;
  });
  protected readonly allLoaded = computed(() => {
    const progress = this.progress();
    return progress.total > 0 && progress.loaded === progress.total;
  });
  protected readonly doneSubtitle = computed(() => {
    const { total, stops } = this.progress();
    const cold = this.plan()?.stacks.some((stack) => stack.placement?.kind === 'refrigerated');
    return `${String(total)} bacs · ${String(stops)} arrêts${cold === true ? ' · caisse froide comprise' : ''}`;
  });

  private readonly tiles = computed(() => {
    const plan = this.plan();
    return plan === null ? new Map() : stackTiles(plan.order, this.loaded());
  });
  protected readonly rows = computed(() => {
    const plan = this.plan();
    return plan === null || plan.floor === null
      ? []
      : floorRows(plan.stacks, plan.order, this.loaded());
  });
  protected readonly next = computed(() => {
    const plan = this.plan();
    return plan === null ? null : nextBin(plan, this.loaded(), this.picked());
  });
  protected readonly nextKey = computed(() => this.next()?.key ?? null);
  protected readonly placement = computed(() => {
    const plan = this.plan();
    const next = this.next();
    return plan === null || next === null ? null : placementLine(plan, next.bin);
  });

  /** La rangée ouverte : figée d'un toucher, sinon celle du prochain bac. */
  protected readonly openRow = computed(() => {
    const rows = this.rows();
    const pinned = this.pinnedRow();
    if (pinned !== null && rows.some((row) => row.row === pinned)) {
      return pinned;
    }
    const stackIndex = this.next()?.bin.stackIndex;
    const own = rows.find((row) => row.stacks.some((stack) => stack.stackIndex === stackIndex));
    return own?.row ?? currentRow(rows) ?? rows[0]?.row ?? null;
  });
  protected readonly openRowView = computed(() => {
    const row = this.rows().find((entry) => entry.row === this.openRow());
    return row === undefined
      ? null
      : {
          title: rowTitle(row.row, this.rows().at(-1)?.row ?? row.row),
          columns: rowColumns(row, this.tiles()),
        };
  });
  protected readonly tabs = computed(() => rowTabs(this.rows(), this.tiles(), this.nextKey()));

  /** Sans plancher : toutes les piles, dans l'ordre d'ouverture. */
  protected readonly allColumns = computed(() =>
    stackColumns(this.plan()?.stacks ?? [], this.tiles()),
  );
  protected readonly coldColumns = computed(() =>
    stackColumns(
      (this.plan()?.stacks ?? []).filter((stack) => stack.placement?.kind === 'refrigerated'),
      this.tiles(),
    ),
  );
  protected readonly offFloorColumns = computed(() =>
    stackColumns(
      (this.plan()?.stacks ?? []).filter((stack) => stack.placement?.kind === 'off_floor'),
      this.tiles(),
    ),
  );

  protected readonly timeOf = parisTimeOf;

  constructor() {
    effect(() => {
      const roundId = this.roundId();
      this.reload();
      untracked(() => void this.open(roundId));
    });
    // Le plan ne change pas quand on scanne : il se relit quand la tournée
    // change de version (un arrêt ajouté, retiré, déplacé).
    effect(() => {
      const key = this.planKey();
      this.planReload();
      const roundId = untracked(() => this.view()?.roundId ?? null);
      if (key !== null && roundId !== null) {
        untracked(() => void this.readPlan(roundId));
      }
    });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  protected retryPlan(): void {
    this.planReload.update((n) => n + 1);
  }

  protected warningVariant(kind: DeliveryLoadingPlanWarningKind): 'alert' | 'warning' {
    return ALERT_WARNINGS.has(kind) ? 'alert' : 'warning';
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

  /** Où le doigt s'est posé sur la vue de rangée, le temps du geste. */
  private swipeOrigin: { readonly x: number; readonly y: number } | null = null;

  protected swipeStart(event: PointerEvent): void {
    this.swipeOrigin = { x: event.clientX, y: event.clientY };
  }

  protected swipeEnd(event: PointerEvent): void {
    const origin = this.swipeOrigin;
    this.swipeOrigin = null;
    if (origin === null) {
      return;
    }
    const step = swipeStep(event.clientX - origin.x, event.clientY - origin.y);
    const row = neighbourRow(
      this.rows().map((entry) => entry.row),
      this.openRow(),
      step,
    );
    if (row !== null) {
      this.showRow(row);
    }
  }

  protected swipeCancel(): void {
    this.swipeOrigin = null;
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
    const accepted = await this.write(
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
    const view = this.view();
    this.notice.set(
      entry === null
        ? {
            variant: 'success',
            title: null,
            text: view === null ? 'Bac chargé.' : loadedNotice(view, payload),
            showRow: null,
          }
        : loadedBinNotice(
            entry,
            elsewhere === null || location === null ? null : { text: elsewhere, location },
            this.next(),
          ),
    );
  }

  protected unload(binId: string): Promise<boolean> {
    this.picked.set(null);
    const roundId = this.roundId();
    return this.write(
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
      await this.write(() => departure(view.roundId, view.version), 'La tournée n’a pas pu partir.')
    ) {
      const text = `${roundLabel(view)} est parti.`;
      this.notice.set({ variant: 'success', title: null, text, showRow: null });
    }
  }

  /** Une écriture, puis une relecture — acceptée ou non. Vrai si le serveur a accepté. */
  private async write(gesture: () => Promise<void>, fallback: string): Promise<boolean> {
    if (this.busy()) {
      return false;
    }
    this.busy.set(true);
    this.notice.set(null);
    let accepted = false;
    try {
      await gesture();
      accepted = true;
    } catch (error) {
      this.notice.set(refusalNotice(httpErrorMessage(error, fallback)));
    } finally {
      await this.read(this.roundId());
      this.busy.set(false);
    }
    return accepted;
  }

  private async open(roundId: string): Promise<void> {
    this.state.set({ status: 'loading' });
    await this.read(roundId);
  }

  private async read(roundId: string): Promise<void> {
    try {
      const view = await this.gateway.round(roundId);
      this.state.set({ status: 'ready', view });
      this.viewChange.emit(view);
    } catch {
      if (this.state().status !== 'ready') {
        this.state.set({ status: 'error' });
      }
    }
  }

  private async readPlan(roundId: string): Promise<void> {
    if (this.planState().status !== 'ready') {
      this.planState.set({ status: 'loading' });
    }
    try {
      this.planState.set({ status: 'ready', plan: await this.gateway.plan(roundId) });
    } catch {
      if (this.planState().status !== 'ready') {
        this.planState.set({ status: 'error' });
      }
    }
  }
}
