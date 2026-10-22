import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { CustomerAccessRowView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldPaginatorComponent,
  FoldSearchComponent,
  FoldViewToggleComponent,
  type FoldBadgeVariant,
  type FoldPaginatorLabels,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldViewToggleOption,
} from 'fold-ng';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import {
  ACCESS_FILTERS,
  STATE_LABELS,
  STATE_VARIANTS,
  activatedLabel,
  canResend,
  invitedLabel,
  isAccessFilter,
  matchesFilter,
  matchesSearch,
  membersLabel,
  resendMessage,
  resendPayload,
  sortRows,
  type AccessFilter,
} from './customer-access';
import { CustomerAccessService } from './customer-access.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Combien de comptes par page — mêmes options que la liste « Comptes clients ». */
const PAGE_SIZES: readonly number[] = [25, 50, 100];

/** Le paginator parle anglais par défaut ; cet écran, non. */
const PAGINATOR_LABELS: FoldPaginatorLabels = {
  pageSize: 'Comptes par page',
  perPage: 'par page',
  nav: 'Pagination des comptes',
  previous: 'Page précédente',
  next: 'Page suivante',
  empty: 'Aucun compte',
  page: (page) => `Page ${page}`,
  range: (start, end, total) => `${start}–${end} sur ${total}`,
};

/**
 * **Accès clients** — sur tous les comptes, qui a un détenteur et qui est entré.
 *
 * La fiche dit l'accès d'UN compte ; cette page répond à la question d'ensemble
 * (« lesquels n'ont personne, lesquels n'ont jamais ouvert leur e-mail ? »).
 * Elle ne fabrique pas de lien : c'est le travail d'« Accès à remettre », le
 * canal de secours. Elle relance par l'e-mail, comme la fiche.
 */
@Component({
  selector: 'app-acces-clients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldPaginatorComponent,
    FoldSearchComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './acces-clients-page.html',
  styleUrl: './acces-clients-page.scss',
})
export class AccesClientsPage {
  private readonly access = inject(CustomerAccessService);
  private readonly companies = inject(AdminCompaniesService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly CustomerAccessRowView[]>([]);
  protected readonly filter = signal<AccessFilter>('all');
  protected readonly search = signal('');
  /** La société dont la relance est en vol — une à la fois. */
  protected readonly pending = signal<string | null>(null);

  protected readonly segments: readonly FoldViewToggleOption[] = ACCESS_FILTERS;

  protected readonly visible = computed(() =>
    sortRows(
      this.rows().filter(
        (row) => matchesFilter(row, this.filter()) && matchesSearch(row, this.search()),
      ),
    ),
  );

  protected readonly paginatorLabels = PAGINATOR_LABELS;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly page = signal(1);
  protected readonly pageSize = signal(PAGE_SIZES[0] ?? 25);

  /**
   * La page réellement rendue : une relecture après relance peut réduire la
   * liste sous la page courante, et l'écran ne doit pas tomber sur une page vide.
   */
  protected readonly clampedPage = computed(() => {
    const pages = Math.max(1, Math.ceil(this.visible().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });

  /** La tranche affichée, prise dans le résultat FILTRÉ — ce que le paginator compte. */
  protected readonly paged = computed(() => {
    const size = this.pageSize();
    const start = (this.clampedPage() - 1) * size;
    return this.visible().slice(start, start + size);
  });

  protected readonly tableTitle = computed(() => {
    const count = this.visible().length;
    return `${count} compte${count > 1 ? 's' : ''}`;
  });

  protected readonly columns: readonly FoldTableColumn<CustomerAccessRowView>[] = [
    { key: 'company', label: 'Société' },
    { key: 'holder', label: 'Détenteur' },
    { key: 'state', label: 'Accès', width: '14rem' },
    { key: 'members', label: 'Autres membres', width: '10rem' },
    { key: 'action', label: '', width: '14rem' },
  ];

  protected readonly empty: FoldTableEmpty = {
    title: 'Aucun compte ne correspond',
    subtitle: 'Changez de filtre ou videz la recherche pour retrouver les autres.',
  };

  protected readonly rowKey = (row: CustomerAccessRowView): string => row.companyId;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.rows.set(await this.access.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected onFilterChange(value: string): void {
    if (isAccessFilter(value)) {
      this.filter.set(value);
      this.page.set(1);
    }
  }

  /** Chercher, c'est repartir du début : la page 3 d'un autre résultat n'a pas de sens. */
  protected onSearchChange(term: string): void {
    this.search.set(term);
    this.page.set(1);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  protected open(row: CustomerAccessRowView): void {
    void this.router.navigate(['/comptes-clients', row.companyId]);
  }

  /** Renvoie l'e-mail d'accès du détenteur, puis relit la table. */
  protected async resend(row: CustomerAccessRowView): Promise<void> {
    const payload = resendPayload(row);
    if (payload === null || this.pending() !== null) {
      return;
    }
    this.pending.set(row.companyId);
    try {
      const result = await this.companies.inviteMember(row.companyId, payload);
      const message = resendMessage(result.mailSent, payload.email);
      if (result.mailSent) {
        this.notify.success(message);
      } else {
        this.notify.info(message);
      }
      this.rows.set(await this.access.list());
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.pending.set(null);
    }
  }

  // `let-row` n'est pas typé : on entre par des méthodes qui rendent la ligne typée.
  protected stateLabel(row: CustomerAccessRowView): string {
    return STATE_LABELS[row.state];
  }
  protected stateVariant(row: CustomerAccessRowView): FoldBadgeVariant {
    return STATE_VARIANTS[row.state];
  }
  protected readonly canResend = canResend;
  protected readonly activatedLabel = activatedLabel;
  protected readonly invitedLabel = invitedLabel;
  protected readonly membersLabel = membersLabel;
}
