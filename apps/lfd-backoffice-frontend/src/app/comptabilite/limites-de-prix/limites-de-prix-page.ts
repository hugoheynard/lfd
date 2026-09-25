import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { FloorClientele, PriceFloorView, PricingBoardView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  FoldViewToggleComponent,
} from 'fold-ng';

import { formatEuros } from '@lfd/catalog-ui';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../auth/permissions.store';
import { TarificationService } from '../../b2b/tarification/tarification.service';
import { PriceLimitsService } from '../price-limits.service';
import {
  BulkFloorPanel,
  type BulkArticle,
  type BulkFloorPanelData,
} from './bulk-floor-panel/bulk-floor-panel';
import { FloorPanel, type FloorPanelData } from './floor-panel/floor-panel';
import {
  limitCoverage,
  matchesFilter,
  type ArticleLimitRow,
  type CoverageFilter,
  type LimitShelf,
  type ScopeLimitRow,
} from './limit-coverage';
import {
  appliedLabel,
  ARTICLE_COLUMNS,
  CLIENTELES,
  doorOf,
  FILTERS,
  isStale,
  SCOPE_COLUMNS,
  sourceLabel,
  type LimitRow,
} from './limit-cells';
import { scopeChoices, targetOf } from './scope-choices';

/**
 * **Comptabilité › Limites de prix** — sous quel prix on ne descend pas, pour
 * les pros et pour le public, article par article.
 *
 * Une table de TOUS les articles, rangée par famille comme la Tarification, et
 * pas la seule liste des limites posées : ce qui compte ici est ce qui n'est
 * PAS couvert. Une entreprise structurée a des limites partout — c'est ce qui
 * garde la marge (Hugo, 2026-09-25) —, d'où deux pastilles : « Sans limite »
 * et « Limite du catalogue seulement ».
 *
 * La structure vient du tableau tarifaire (`GET /admin/pricing`), les limites
 * de la liste de la clientèle (`GET /admin/pricing/floors?clientele=`), et
 * l'héritage se calcule par portée (`limit-coverage.ts`) — pour le pro comme
 * pour le public, avec le même code.
 *
 * Une ligne ouvre le panneau de SA portée. Sans `lfc_price_limits:write`, il
 * s'ouvre en lecture, et ni création ni sélection ne s'affichent.
 * Plan : `documentation/comptabilite/plan-limites-de-prix.md` §6.
 */
@Component({
  selector: 'app-limites-de-prix-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './limites-de-prix-page.html',
  styleUrl: './limites-de-prix-page.scss',
})
export class LimitesDePrixPage {
  private readonly limits = inject(PriceLimitsService);
  private readonly tarification = inject(TarificationService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly clienteles = CLIENTELES;
  protected readonly filters = FILTERS;
  protected readonly scopeColumns = SCOPE_COLUMNS;
  protected readonly articleColumns = ARTICLE_COLUMNS;

  protected readonly clientele = signal<FloorClientele>('pro');
  protected readonly filter = signal<CoverageFilter>('all');
  protected readonly floors = signal<readonly PriceFloorView[]>([]);
  protected readonly board = signal<PricingBoardView | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  /** Les articles cochés, par référence — toutes familles confondues. */
  protected readonly selected = signal<ReadonlySet<string>>(new Set());

  protected readonly euros = formatEuros;

  /** Les gestes demandent `lfc_price_limits:write` ; sans lui, tout se lit seulement. */
  protected readonly canWrite = computed(() => this.permissions.can('lfc_price_limits:write'));

  protected readonly coverage = computed(() => {
    const board = this.board();
    return board === null ? null : limitCoverage(board, this.floors());
  });

  /** Le catalogue, puis chaque famille — les lignes des portées larges. */
  protected readonly scopeRows = computed<readonly ScopeLimitRow[]>(() => {
    const coverage = this.coverage();
    return coverage === null
      ? []
      : [coverage.catalogue, ...coverage.shelves.map((shelf) => shelf.family)];
  });

  private readonly allArticles = computed(() =>
    (this.coverage()?.shelves ?? []).flatMap((shelf) => shelf.articles),
  );

  protected readonly uncoveredCount = computed(
    () => this.allArticles().filter((row) => row.coverage === 'none').length,
  );
  protected readonly globalOnlyCount = computed(
    () => this.allArticles().filter((row) => row.coverage === 'global-only').length,
  );

  /** Les rayons sous le filtre ; un rayon vide disparaît. */
  protected readonly visibleShelves = computed<readonly LimitShelf[]>(() =>
    (this.coverage()?.shelves ?? [])
      .map((shelf) => ({
        family: shelf.family,
        articles: shelf.articles.filter((row) => matchesFilter(row, this.filter())),
      }))
      .filter((shelf) => shelf.articles.length > 0),
  );

  protected readonly filteredCount = computed(() =>
    this.visibleShelves().reduce((sum, shelf) => sum + shelf.articles.length, 0),
  );

  protected readonly rowKey = (row: LimitRow): string => row.key;
  protected readonly articleKey = (row: ArticleLimitRow): string => row.sku;
  protected readonly selectionLabel = (row: ArticleLimitRow): string => row.name;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    const clientele = this.clientele();
    try {
      const [view, board] = await Promise.all([
        this.limits.list(clientele),
        this.tarification.read(),
      ]);
      // La clientèle RENDUE fait foi : une réponse lente d'avant la bascule ne
      // doit pas s'afficher sous l'autre segment.
      if (view.clientele === this.clientele()) {
        this.floors.set(view.floors);
        this.board.set(board);
      }
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les limites sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected setClientele(value: string): void {
    const next: FloorClientele = value === 'public' ? 'public' : 'pro';
    if (next === this.clientele()) {
      return;
    }
    this.clientele.set(next);
    this.floors.set([]);
    this.selected.set(new Set());
    void this.load();
  }

  protected setFilter(value: CoverageFilter): void {
    this.filter.set(value);
  }

  // --- Sélection -----------------------------------------------------------

  protected selectedIn(shelf: LimitShelf): ReadonlySet<string> {
    const all = this.selected();
    return new Set(shelf.articles.map((row) => row.sku).filter((sku) => all.has(sku)));
  }

  /** Le tableau d'un rayon rend SA sélection : on la recoud dans celle de la page. */
  protected onSelect(shelf: LimitShelf, next: ReadonlySet<string | number>): void {
    const merged = new Set(this.selected());
    for (const row of shelf.articles) {
      if (next.has(row.sku)) {
        merged.add(row.sku);
      } else {
        merged.delete(row.sku);
      }
    }
    this.selected.set(merged);
  }

  protected selectFiltered(): void {
    const merged = new Set(this.selected());
    for (const shelf of this.visibleShelves()) {
      shelf.articles.forEach((row) => merged.add(row.sku));
    }
    this.selected.set(merged);
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected readonly appliedLabel = appliedLabel;
  protected readonly sourceLabel = sourceLabel;
  protected readonly doorOf = doorOf;
  protected readonly isStale = isStale;

  protected coverageOf(row: ArticleLimitRow): ArticleLimitRow['coverage'] {
    return row.coverage;
  }

  // --- Gestes ----------------------------------------------------------------

  /** Une ligne ouvre le panneau de SA portée : poser si rien n'y est, modifier sinon. */
  protected open(row: LimitRow): void {
    void this.openPanel({
      clientele: this.clientele(),
      canWrite: this.canWrite(),
      target: targetOf(row),
      choices: [],
    });
  }

  /** « Créer une limite » : le panneau vide, la portée se choisit dedans. */
  protected create(): void {
    void this.openPanel({
      clientele: this.clientele(),
      canWrite: this.canWrite(),
      target: null,
      choices: scopeChoices(this.coverage()),
    });
  }

  protected async openBulk(): Promise<void> {
    const chosen = this.selected();
    const articles: BulkArticle[] = this.allArticles()
      .filter((row) => chosen.has(row.sku))
      .map((row) => ({ sku: row.sku, name: row.name, hasOwn: row.own !== null }));
    if (articles.length === 0) {
      return;
    }
    const done = await this.panels.open<BulkFloorPanelData, boolean>(BulkFloorPanel, {
      data: { clientele: this.clientele(), articles },
      width: 'md',
    }).closed;
    if (done === true) {
      this.selected.set(new Set());
      await this.load();
    }
  }

  private async openPanel(data: FloorPanelData): Promise<void> {
    const done = await this.panels.open<FloorPanelData | undefined, boolean>(FloorPanel, {
      data,
      width: 'md',
    }).closed;
    if (done === true) {
      await this.load();
    }
  }
}
