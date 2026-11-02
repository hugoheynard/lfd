import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { LiveStockAlertsView, ResupplyProductionDayView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldSearchComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { resupplyDayLabel } from '../../../shared/resupply-labels';
import { parisToday } from '../../../shared/paris-today';
import { shiftDay } from '../../previsionnel/previsionnel-range';
import { BakehouseDraftsSection } from '../bakehouse-drafts-section/bakehouse-drafts-section';
import { LiveStockAlertsService } from '../live-stock-alerts.service';
import { ResuppliesToProduceService } from '../resupplies-to-produce.service';
import { ResupplyLaunchCard } from '../resupply-launch-card/resupply-launch-card';
import { resupplyLaunchRows } from '../resupply-launch-card/resupply-launch-rows';
import { ResupplyMountCard } from '../resupply-mount-card/resupply-mount-card';
import { resupplyMountRows } from '../resupply-mount-card/resupply-mount-rows';
import {
  resupplyPoints,
  resupplyProductionRows,
  type ResupplyProductionRow,
} from '../resupply-production-rows';
import { SaleQuantityPipe } from '../../../shared/sale-quantity/sale-quantity.pipe';

type LoadState = 'loading' | 'ready' | 'error';

/** Le pas de relecture du jour : une minute de retard au plus sur minuit. */
const TODAY_POLL_MS = 60_000;

/** La puce « Tout » des familles. */
const ALL_CATEGORIES = '';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * **L'onglet « Réassorts » de Prod manager** (lot R3d,
 * `reassort-boutiques/README.md`, Hugo 2026-10-21 :
 * « reprendre la structure de la demande de réassort, en table »).
 *
 * La table de la demande du comptoir (R1e), vue du fournil : une ligne par
 * produit, puces de famille et recherche au-dessus ; une colonne par point,
 * ses quantités « pour demain » et « au plus tôt » de la journée affichée, et
 * ses ruptures ou stocks faibles en marque ; un total par produit. EN LECTURE :
 * le seul geste est « Envoyer un réassort » (R1d), sous `production_resupply`.
 *
 * Les « pour demain » d'un plan arrêté y sont, dits FIGÉS : ils sont sur la
 * feuille du fournil, et ne bougent plus. Les alertes sont celles de
 * maintenant : une journée passée ne les montre pas.
 *
 * Depuis le lot R3e (2026-10-22), la carte « À monter » porte le second
 * geste : « Monté », pour les réassorts d'un point servi sur place. Depuis
 * R4a, la carte « Au plus tôt » porte « Lancer » : le réassort du jour entre
 * au plan du fournil.
 *
 * La journée vit dans l'URL (`?day=`) ; par défaut, demain — le service que
 * le fournil prépare.
 */
@Component({
  selector: 'app-resupply-production-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BakehouseDraftsSection,
    RouterLink,
    ResupplyLaunchCard,
    ResupplyMountCard,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldSearchComponent,
    FoldViewToggleComponent,
    SaleQuantityPipe,
  ],
  templateUrl: './resupply-production-tab.html',
  styleUrl: './resupply-production-tab.scss',
})
export class ResupplyProductionTab {
  private readonly service = inject(ResuppliesToProduceService);
  private readonly stockAlerts = inject(LiveStockAlertsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * Le jour du poste, à Paris, relu chaque minute : un onglet resté ouvert la
   * nuit doit savoir qu'on a changé de jour, sinon « demain » et les alertes
   * vivantes restent ceux de la veille. Le signal n'émet que si le jour change.
   */
  private readonly todaySignal = signal(parisToday());

  protected readonly canSend = computed(() => this.permissions.can('production_resupply:write'));
  protected readonly day = signal(
    this.route.snapshot.queryParamMap.get('day') ?? shiftDay(this.todaySignal(), 1),
  );
  protected readonly dayLabel = computed(() => resupplyDayLabel(this.day()));
  protected readonly atTomorrow = computed(() => this.day() === shiftDay(this.todaySignal(), 1));

  protected readonly state = signal<LoadState>('loading');
  private readonly view = signal<ResupplyProductionDayView | null>(null);
  private readonly alerts = signal<LiveStockAlertsView | null>(null);
  /** Les alertes n'ont pas pu être lues : la table reste juste, sans leurs marques. */
  protected readonly alertsLost = signal(false);

  /** La journée, si un point y a un « au plus tôt » envoyé : la carte « Au plus tôt » (R4a). */
  protected readonly launchable = computed(() => {
    const view = this.view();
    return view !== null && resupplyLaunchRows(view).length > 0 ? view : null;
  });

  /** La journée, si un point servi sur place y a un réassort envoyé : la carte « À monter ». */
  protected readonly mountable = computed(() => {
    const view = this.view();
    return view !== null && resupplyMountRows(view).length > 0 ? view : null;
  });

  protected readonly planStopped = computed(() => this.view()?.planStopped ?? false);
  /** « Pour demain · figé » une fois le plan arrêté, « · envoyé » avant. */
  protected readonly tomorrowLabel = computed(() =>
    this.planStopped() ? 'Pour demain · figé' : 'Pour demain · envoyé',
  );

  /** Les alertes de maintenant ne disent rien d'une journée passée. */
  private readonly liveAlerts = computed(() =>
    this.day() >= this.todaySignal() ? this.alerts() : null,
  );

  protected readonly points = computed(() => {
    const view = this.view();
    return view === null ? [] : resupplyPoints(view, this.liveAlerts());
  });

  private readonly rows = computed<readonly ResupplyProductionRow[]>(() => {
    const view = this.view();
    return view === null ? [] : resupplyProductionRows(view, this.points(), this.liveAlerts());
  });

  protected readonly query = signal('');
  protected readonly category = signal<string>(ALL_CATEGORIES);

  /** « Tout », puis une puce par famille du catalogue, dans son ordre. */
  protected readonly categoryOptions = computed(() => {
    const families = new Map<string, string>();
    for (const article of this.view()?.articles ?? []) {
      if (!families.has(article.categoryId)) {
        families.set(article.categoryId, article.categoryName);
      }
    }
    return [
      { value: ALL_CATEGORIES, label: 'Tout' },
      ...[...families].map(([value, label]) => ({ value, label })),
    ];
  });

  protected readonly visibleRows = computed(() => {
    const query = normalize(this.query().trim());
    const category = this.category();
    return this.rows().filter(
      (row) =>
        (category === ALL_CATEGORIES || row.categoryId === category) &&
        (query === '' || normalize(`${row.name} ${row.sku}`).includes(query)),
    );
  });

  /**
   * Le total de la journée, tous produits : ce que les points attendent du
   * fournil. Les pièces ne comptent que les pièces ; le poids se dit à part
   * (lot L2b-4), jamais additionné aux pièces.
   */
  protected readonly pieces = computed(() =>
    this.rows().reduce((sum, row) => sum + (row.saleUnit === 'weight' ? 0 : row.total), 0),
  );
  protected readonly weightGrams = computed(() =>
    this.rows().reduce((sum, row) => sum + (row.saleUnit === 'weight' ? row.total : 0), 0),
  );

  /** Le numéro de la dernière lecture : une réponse lente n'écrase pas une plus récente. */
  private readSeq = 0;

  constructor() {
    const clock = setInterval(() => this.todaySignal.set(parisToday()), TODAY_POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
    effect(() => {
      void this.load(this.day());
    });
  }

  /** Une journée en avant ou en arrière, et l'URL avec. */
  protected shift(days: number): void {
    this.go(shiftDay(this.day(), days));
  }

  protected backToTomorrow(): void {
    this.go(shiftDay(this.todaySignal(), 1));
  }

  private go(day: string): void {
    this.day.set(day);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { day },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected async load(day: string = this.day()): Promise<void> {
    const seq = ++this.readSeq;
    this.state.set('loading');
    try {
      const [view, alerts] = await Promise.all([
        this.service.day(day),
        this.stockAlerts.read().catch(() => null),
      ]);
      if (seq !== this.readSeq) {
        return;
      }
      this.view.set(view);
      this.alerts.set(alerts);
      this.alertsLost.set(alerts === null);
      this.state.set('ready');
    } catch {
      if (seq === this.readSeq) {
        this.state.set('error');
      }
    }
  }
}
