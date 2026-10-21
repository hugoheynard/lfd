import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
import { isoDay, shiftDay } from '../../previsionnel/previsionnel-range';
import { BakehouseResupplyCard } from '../bakehouse-resupply-card/bakehouse-resupply-card';
import { LiveStockAlertsService } from '../live-stock-alerts.service';
import { ResuppliesToProduceService } from '../resupplies-to-produce.service';
import {
  resupplyPoints,
  resupplyProductionRows,
  type ResupplyProductionRow,
} from '../resupply-production-rows';

type LoadState = 'loading' | 'ready' | 'error';

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
 * `reassort-boutiques/plan-reapprovisionnement.md`, Hugo 2026-10-21 :
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
 * La journée vit dans l'URL (`?day=`) ; par défaut, demain — le service que
 * le fournil prépare.
 */
@Component({
  selector: 'app-resupply-production-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BakehouseResupplyCard,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldSearchComponent,
    FoldViewToggleComponent,
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

  /** Le jour du poste, lu une fois, comme le prévisionnel. */
  private readonly today = isoDay(new Date());

  protected readonly canSend = computed(() => this.permissions.can('production_resupply:write'));
  protected readonly day = signal(
    this.route.snapshot.queryParamMap.get('day') ?? shiftDay(this.today, 1),
  );
  protected readonly dayLabel = computed(() => resupplyDayLabel(this.day()));
  protected readonly atTomorrow = computed(() => this.day() === shiftDay(this.today, 1));

  protected readonly state = signal<LoadState>('loading');
  private readonly view = signal<ResupplyProductionDayView | null>(null);
  private readonly alerts = signal<LiveStockAlertsView | null>(null);
  /** Les alertes n'ont pas pu être lues : la table reste juste, sans leurs marques. */
  protected readonly alertsLost = signal(false);

  protected readonly planStopped = computed(() => this.view()?.planStopped ?? false);
  /** « Pour demain · figé » une fois le plan arrêté, « · envoyé » avant. */
  protected readonly tomorrowLabel = computed(() =>
    this.planStopped() ? 'Pour demain · figé' : 'Pour demain · envoyé',
  );

  /** Les alertes de maintenant ne disent rien d'une journée passée. */
  private readonly liveAlerts = computed(() => (this.day() >= this.today ? this.alerts() : null));

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

  /** Le total de la journée, tous produits : ce que les points attendent du fournil. */
  protected readonly pieces = computed(() => this.rows().reduce((sum, row) => sum + row.total, 0));

  /** Le numéro de la dernière lecture : une réponse lente n'écrase pas une plus récente. */
  private readSeq = 0;

  constructor() {
    effect(() => {
      void this.load(this.day());
    });
  }

  /** Une journée en avant ou en arrière, et l'URL avec. */
  protected shift(days: number): void {
    this.go(shiftDay(this.day(), days));
  }

  protected backToTomorrow(): void {
    this.go(shiftDay(this.today, 1));
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
