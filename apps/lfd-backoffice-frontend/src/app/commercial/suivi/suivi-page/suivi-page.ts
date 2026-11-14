import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  COMPANY_CONTACT_MODES,
  SALES_OVERSIGHT_CHANNELS,
  SALES_OVERSIGHT_SIGNALS,
  SALES_OVERSIGHT_UNASSIGNED,
  SALES_WORK_LEVELS,
  type SalesOversightRowView,
  type SalesOversightView,
} from '@lfd/contracts';
import { httpErrorCode } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowNoteDirective,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldPaginatorComponent,
  FoldPanelHostService,
  type FoldBadgeVariant,
  type FoldPaginatorLabels,
  type FoldSelectItem,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';
import { map } from 'rxjs';

import {
  CHANNEL_LABELS,
  LEVEL_LABELS,
  LEVEL_VARIANTS,
  SIGNAL_LABELS,
  filtersFromParams,
  followerLabel,
  missingLabel,
  signalBadges,
  type SalesOversightFilters,
  type SignalBadge,
} from '../sales-oversight-filters';
import { PermissionsStore } from '../../../auth/permissions.store';
import { dialogSide } from '../../../b2b/reglages/delivery-zones-section/delivery-audiences';
import { CONTACT_MODE_LABELS } from '../../../fiche-client/panels/note-contact-panel/note-contact-panel';
import { AssignFollowerPanel } from '../assign-follower-panel/assign-follower-panel';
import { SalesOversightService } from '../sales-oversight.service';

/** Le code du refus « trop de fiches pour ce filtre ». */
const TOO_LARGE_CODE = 'growth.sales_oversight.too_large';

/** La valeur des listes qui veut dire « pas de filtre ». */
const ALL = 'all';

type LoadState = 'loading' | 'ready' | 'error' | 'too-large';

const PAGINATOR_LABELS: FoldPaginatorLabels = {
  pageSize: 'Fiches par page',
  perPage: 'par page',
  nav: 'Pagination des fiches',
  previous: 'Page précédente',
  next: 'Page suivante',
  empty: 'Aucune fiche',
  page: (page) => `Page ${page}`,
  range: (start, end, total) => `${start}–${end} sur ${total}`,
};

/**
 * **Le suivi commercial** — un seul tableau, une ligne par fiche principale,
 * filtrable par commercial, niveau, signal et canal
 * (`documentation/b2b/plan-suivi-commercial.md`, § 1 et § 3.3).
 *
 * Les filtres vivent dans l'URL : un lien collé rouvre le même tableau, et
 * l'URL est la seule source — changer un filtre navigue, la lecture suit.
 */
@Component({
  selector: 'app-suivi-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDataTableRowNoteDirective,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldPaginatorComponent,
  ],
  templateUrl: './suivi-page.html',
  styleUrl: './suivi-page.scss',
})
export class SuiviPage {
  private readonly api = inject(SalesOversightService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly permissions = inject(PermissionsStore);
  private readonly panelHost = inject(FoldPanelHostService);

  protected readonly filters = toSignal(this.route.queryParamMap.pipe(map(filtersFromParams)), {
    initialValue: filtersFromParams(this.route.snapshot.queryParamMap),
  });

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<SalesOversightView | null>(null);
  /** Le numéro de la lecture en cours : une réponse tardive n'écrase pas la suivante. */
  private sequence = 0;

  protected readonly followerOptions = computed<readonly FoldSelectItem<string>[]>(() => [
    { value: ALL, label: 'Tous' },
    ...(this.view()?.followers ?? []).map((follower) => ({
      value: follower.id,
      label: follower.name ?? 'Membre sans nom',
    })),
    { value: SALES_OVERSIGHT_UNASSIGNED, label: 'Non attribuée' },
  ]);
  protected readonly levelOptions: readonly FoldSelectItem<string>[] = [
    { value: ALL, label: 'Tous' },
    ...SALES_WORK_LEVELS.map((level) => ({ value: level, label: LEVEL_LABELS[level] })),
  ];
  protected readonly signalOptions: readonly FoldSelectItem<string>[] = [
    { value: ALL, label: 'Tous' },
    ...SALES_OVERSIGHT_SIGNALS.map((key) => ({ value: key, label: SIGNAL_LABELS[key] })),
  ];
  protected readonly channelOptions: readonly FoldSelectItem<string>[] = [
    { value: ALL, label: 'Tous' },
    ...SALES_OVERSIGHT_CHANNELS.map((key) => ({ value: key, label: CHANNEL_LABELS[key] })),
  ];

  /** « 38 Annuaire · 8 Contactée · … » selon les filtres. */
  protected readonly counts = computed(() => {
    const counts = this.view()?.counts;
    if (counts === undefined) return [];
    return SALES_WORK_LEVELS.map((level) => ({
      level,
      label: `${counts[level]} ${LEVEL_LABELS[level]}`,
    }));
  });

  /**
   * « Aujourd'hui : 12 fiches ouvertes · 0 montée · … » — le jour civil de
   * Paris, selon les filtres commercial et canal (jamais niveau ni signal).
   */
  protected readonly todayLine = computed(() => {
    const today = this.view()?.today;
    if (today === undefined) return null;
    const contacts = COMPANY_CONTACT_MODES.filter((mode) => today.contacts[mode] > 0).map(
      (mode) => `${today.contacts[mode]} ${CONTACT_MODE_LABELS[mode].toLowerCase()}`,
    );
    return [
      plural(today.opened, 'fiche ouverte', 'fiches ouvertes'),
      plural(today.levelUps, 'montée', 'montées'),
      plural(today.accessResent, 'accès renvoyé', 'accès renvoyés'),
      contacts.length === 0 ? 'aucun contact' : `contacts : ${contacts.join(', ')}`,
    ].join(' · ');
  });

  protected readonly tableTitle = computed(() => {
    const total = this.view()?.total ?? 0;
    return `${total} fiche${total > 1 ? 's' : ''}`;
  });

  protected readonly columns: readonly FoldTableColumn<SalesOversightRowView>[] = [
    { key: 'company', label: 'Fiche' },
    { key: 'reference', label: 'Réf.', width: '8rem' },
    { key: 'level', label: 'Niveau', width: '8rem' },
    { key: 'age', label: 'Âge', width: '5rem' },
    { key: 'follower', label: 'Suivie par', width: '11rem' },
    { key: 'signals', label: 'Signaux', width: '16rem' },
    ...(this.permissions.can('b2b_sales_oversight:write')
      ? [{ key: 'assign', label: 'Suivi', width: '9rem' }]
      : []),
  ];

  protected readonly empty: FoldTableEmpty = {
    title: 'Aucune fiche ne correspond',
    subtitle: 'Changez de filtre pour retrouver les autres fiches.',
  };

  protected readonly paginatorLabels = PAGINATOR_LABELS;
  protected readonly hasMissing = (row: SalesOversightRowView): boolean => row.missing.length > 0;
  protected readonly rowKey = (row: SalesOversightRowView): string => row.companyId;

  constructor() {
    effect(() => {
      void this.load(this.filters());
    });
  }

  protected reload(): void {
    void this.load(this.filters());
  }

  private async load(filters: SalesOversightFilters): Promise<void> {
    const mine = ++this.sequence;
    this.state.set('loading');
    try {
      const view = await this.api.read(filters);
      if (mine !== this.sequence) return;
      this.view.set(view);
      this.state.set('ready');
    } catch (error) {
      if (mine !== this.sequence) return;
      this.view.set(null);
      this.state.set(httpErrorCode(error) === TOO_LARGE_CODE ? 'too-large' : 'error');
    }
  }

  protected selected(value: string | null): string {
    return value ?? ALL;
  }

  /** Un filtre change : l'URL le dit, et la liste repart de la première page. */
  protected setFilter(key: 'follower' | 'level' | 'signal' | 'channel', value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: value === ALL ? null : value, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected setPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page === 1 ? null : page },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Ouvre le dialogue qui confie la fiche. Un succès relit la page : le
   * suiveur, les compteurs et les signaux en dépendent.
   */
  protected assign(row: SalesOversightRowView): void {
    const ref = this.panelHost.open(AssignFollowerPanel, {
      side: dialogSide(),
      data: {
        companyId: row.companyId,
        companyName: row.name,
        currentFollowerId: row.followedBy?.id ?? null,
        assignable: this.view()?.assignable ?? [],
      },
    });
    void ref.closed.then((changed) => {
      if (changed === true) this.reload();
    });
  }

  protected assignLabel(row: SalesOversightRowView): string {
    return row.followedBy === null ? 'Attribuer' : 'Réattribuer';
  }

  protected open(row: SalesOversightRowView): void {
    void this.router.navigate(['/comptes-clients', row.companyId]);
  }

  // `let-row` n'est pas typé : on entre par des méthodes qui rendent la ligne typée.
  protected levelLabel(row: SalesOversightRowView): string {
    return LEVEL_LABELS[row.level];
  }
  protected levelVariant(row: SalesOversightRowView): FoldBadgeVariant {
    return LEVEL_VARIANTS[row.level];
  }
  protected badges(row: SalesOversightRowView): readonly SignalBadge[] {
    return signalBadges(row);
  }
  protected missing(row: SalesOversightRowView): string | null {
    return missingLabel(row);
  }
  protected follower(row: SalesOversightRowView): string {
    return followerLabel(row);
  }
  protected selfDeclared(row: SalesOversightRowView): boolean {
    return row.declaredVia === 'self';
  }
}

/** « 0 montée », « 1 montée », « 2 montées ». */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}
