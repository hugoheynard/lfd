import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { CompanyMemberRole, MyIssuedInvoiceView, MyIssuedInvoicesView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
  type FoldSelectOption,
  type FoldTableColumn,
} from 'fold-ng';

import { ClientChrome } from '../../client-chrome.service';
import { ClientCompany } from '../../client-company.service';
import {
  ClientInvoices,
  InvoiceArchiveRefused,
  type InvoiceArchiveRequest,
  type InvoiceFilters,
} from '../../client-invoices.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { downloadBlob } from '../../mes-commandes/download-blob';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { InvoiceDialog } from '../invoice-dialog/invoice-dialog';
import {
  invoiceDay,
  invoiceKind,
  invoiceMonth,
  monthName,
  rejectedWithOthers,
  settlementLabel,
  settlementTone,
} from '../invoice-format';

/** Où en est la lecture de la liste. */
type ReadStatus = 'loading' | 'failed' | 'ready';
type KindFilter = InvoiceFilters['kind'];

/**
 * Les rôles qui voient les factures — détenteur, facturation et, depuis le
 * 2026-10-21 (Hugo, 5da7346b6), l'administrateur —, et
 * le mur que l'API tient (`invoice-access.ts`). Aux autres, l'écran le dit
 * plutôt que de laisser un 403 passer pour une panne.
 */
const INVOICE_ROLES: ReadonlySet<CompanyMemberRole> = new Set(['owner', 'billing', 'admin']);
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const NO_FILTER: InvoiceFilters = { year: null, month: null, kind: null };

/**
 * `/mes-factures` — les factures et avoirs de la société (plan
 * `documentation/comptabilite/facturation/plan-page-mes-factures.md`, lot P3).
 *
 * En tête, le **total dû** : l'état du COMPTE, servi par le serveur, qui ne
 * suit pas les filtres (§7.3). Dessous, la liste filtrée — par le serveur —,
 * chaque pièce avec son statut de règlement DÉRIVÉ (§7.1) ; un zip pour la
 * sélection ou pour tout ce qui est affiché, entier ou refusé (§7.5).
 *
 * Page du shell client : bandeau `clientBanner`, pas de `fold-page-layout`.
 * La société est celle de l'espace en cours (`ClientCompany`), comme la carte
 * du dossier qu'elle remplace.
 */
@Component({
  selector: 'app-invoices-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './invoices-page.html',
  styleUrl: './invoices-page.scss',
})
export class InvoicesPage {
  protected readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale).current;
  private readonly client = inject(ClientCompany);
  private readonly invoices = inject(ClientInvoices);
  private readonly panels = inject(FoldPanelHostService);
  private readonly chrome = inject(ClientChrome);

  protected readonly copy = computed(() => this.t().account.invoices);
  private readonly companyId = computed(() => this.client.company()?.id ?? null);
  protected readonly allowed = computed(() => this.client.readsBilling(INVOICE_ROLES));

  protected readonly status = signal<ReadStatus>('loading');
  protected readonly refreshing = signal(false);
  protected readonly view = signal<MyIssuedInvoicesView | null>(null);
  protected readonly filters = signal<InvoiceFilters>(NO_FILTER);
  protected readonly selected = signal<ReadonlySet<string | number>>(new Set());
  /** Le zip en cours : la sélection, ou tout l'affiché. */
  protected readonly archiving = signal<'selection' | 'shown' | null>(null);
  /** Un refus du serveur (zip, PDF) — affiché tel quel, la liste reste. */
  protected readonly problem = signal<string | null>(null);
  /** Les années vues : la première lecture est sans filtre, elle les donne toutes. */
  private readonly knownYears = signal<ReadonlySet<number>>(new Set());
  private readSequence = 0;

  protected readonly rows = computed(() => this.view()?.invoices ?? []);
  protected readonly euros = formatCents;

  protected readonly due = computed(() => {
    const due = this.view()?.amountDue;
    if (due === undefined) {
      return null;
    }
    const copy = this.copy();
    const amount = formatCents(due.rejectedCents);
    return {
      total: formatCents(due.totalCents),
      count:
        due.invoiceCount === 0
          ? copy.dueNothing
          : due.invoiceCount === 1
            ? copy.dueCountOne
            : fill(copy.dueCount, { n: String(due.invoiceCount) }),
      rejected:
        due.rejectedCount === 0
          ? null
          : due.rejectedCount === 1
            ? fill(copy.dueRejectedOne, { amount })
            : fill(copy.dueRejected, { n: String(due.rejectedCount), amount }),
    };
  });

  /** Les avoirs de la liste affichée, à part : ils ne se déduisent pas du total. */
  protected readonly creditNotes = computed(() => {
    const notes = this.rows().filter((invoice) => invoice.kind === 'credit_note');
    if (notes.length === 0) {
      return null;
    }
    const amount = formatCents(notes.reduce((sum, note) => sum + note.totalTtcCents, 0));
    const copy = this.copy();
    return notes.length === 1
      ? fill(copy.creditNotesShownOne, { amount })
      : fill(copy.creditNotesShown, { n: String(notes.length), amount });
  });

  protected readonly yearOptions = computed<readonly FoldSelectOption<number | null>[]>(() => [
    { value: null, label: this.copy().allYears },
    ...[...this.knownYears()]
      .sort((a, b) => b - a)
      .map((year) => ({ value: year, label: String(year) })),
  ]);

  protected readonly monthOptions = computed<readonly FoldSelectOption<number | null>[]>(() => [
    { value: null, label: this.copy().allMonths },
    ...MONTHS.map((month) => ({ value: month, label: monthName(month, this.locale()) })),
  ]);

  protected readonly kindOptions = computed<readonly FoldSelectOption<KindFilter>[]>(() => [
    { value: null, label: this.copy().kindAll },
    { value: 'invoice', label: this.copy().kindInvoices },
    { value: 'credit_note', label: this.copy().kindCreditNotes },
  ]);

  protected readonly filtered = computed(() => {
    const { year, kind } = this.filters();
    return year !== null || kind !== null;
  });

  protected readonly columns = computed<readonly FoldTableColumn<MyIssuedInvoiceView>[]>(() => {
    const copy = this.copy();
    const locale = this.locale();
    return [
      { key: 'number', label: copy.colNumber, value: (row) => row.number },
      { key: 'kind', label: copy.colKind, value: (row) => invoiceKind(row, copy) },
      {
        key: 'period',
        label: copy.colPeriod,
        value: (row) => (row.period === null ? '—' : invoiceMonth(row.period, locale)),
      },
      { key: 'issued', label: copy.colIssued, value: (row) => invoiceDay(row.issuedOn, locale) },
      {
        key: 'total',
        label: copy.colTotal,
        numeric: true,
        value: (row) => formatCents(row.totalTtcCents),
      },
      { key: 'status', label: copy.colStatus },
      { key: 'actions', label: copy.colActions },
    ];
  });

  protected readonly tableLabels = computed(() => ({ selectAll: this.copy().selectAll }));
  protected readonly key = (row: MyIssuedInvoiceView): string => row.invoiceId;
  protected readonly selectionLabel = (row: MyIssuedInvoiceView): string =>
    fill(this.copy().selectRow, { number: row.number });
  protected readonly selectionCount = computed(() =>
    fill(this.copy().downloadSelection, { n: String(this.selected().size) }),
  );

  constructor() {
    effect(() => this.chrome.kicker.set(this.t().nav.destinations.invoices));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.barOnDesktop.set(true);

    effect(() => {
      const id = this.companyId();
      const filters = this.filters();
      if (id !== null && this.allowed()) {
        untracked(() => void this.read(id, filters));
      }
    });
  }

  protected chooseYear(year: number | null): void {
    // Un mois ne se choisit qu'avec son année : sans année, il tombe.
    this.filters.update((f) => ({ ...f, year, month: year === null ? null : f.month }));
  }

  protected chooseMonth(month: number | null): void {
    this.filters.update((f) => ({ ...f, month }));
  }

  protected chooseKind(kind: KindFilter): void {
    this.filters.update((f) => ({ ...f, kind }));
  }

  protected retry(): void {
    const id = this.companyId();
    if (id !== null) {
      void this.read(id, this.filters());
    }
  }

  protected tone = settlementTone;

  protected statusOf(row: MyIssuedInvoiceView): string {
    return row.settlement === null
      ? this.copy().noStatus
      : settlementLabel(row.settlement, this.copy(), this.locale());
  }

  protected othersOf(row: MyIssuedInvoiceView): string | null {
    return row.settlement === null ? null : rejectedWithOthers(row.settlement, this.copy());
  }

  protected open(row: MyIssuedInvoiceView): void {
    const id = this.companyId();
    if (id !== null) {
      InvoiceDialog.open(this.panels, id, row.invoiceId);
    }
  }

  /** Le PDF d'une pièce, nommé d'après son numéro. */
  protected async download(row: MyIssuedInvoiceView): Promise<void> {
    const id = this.companyId();
    if (id === null) {
      return;
    }
    this.problem.set(null);
    try {
      downloadBlob(`${row.number}.pdf`, await this.invoices.document(id, row.invoiceId));
    } catch {
      this.problem.set(this.copy().downloadFailed);
    }
  }

  protected downloadSelection(): void {
    const ids = [...this.selected()].map(String);
    void this.archive('selection', { ids });
  }

  protected downloadShown(): void {
    void this.archive('shown', { filters: this.filters() });
  }

  /** Le zip, entier ou refusé : un refus montre le message du serveur, qui nomme les pièces. */
  private async archive(
    which: 'selection' | 'shown',
    request: InvoiceArchiveRequest,
  ): Promise<void> {
    const id = this.companyId();
    if (id === null || this.archiving() !== null) {
      return;
    }
    this.archiving.set(which);
    this.problem.set(null);
    try {
      const { fileName, blob } = await this.invoices.archive(id, request);
      downloadBlob(fileName, blob);
    } catch (error) {
      const message = error instanceof InvoiceArchiveRefused ? error.serverMessage : null;
      this.problem.set(message ?? this.copy().archiveFailed);
    } finally {
      this.archiving.set(null);
    }
  }

  private async read(companyId: string, filters: InvoiceFilters): Promise<void> {
    const sequence = ++this.readSequence;
    if (this.view() === null) {
      this.status.set('loading');
    } else {
      this.refreshing.set(true);
    }
    try {
      const view = await this.invoices.list(companyId, filters);
      if (sequence !== this.readSequence) {
        return;
      }
      this.view.set(view);
      this.selected.set(new Set());
      this.knownYears.update((years) => {
        const next = new Set(years);
        view.invoices.forEach((invoice) => next.add(Number(invoice.issuedOn.slice(0, 4))));
        return next;
      });
      this.status.set('ready');
    } catch {
      if (sequence === this.readSequence) {
        this.status.set('failed');
      }
    } finally {
      if (sequence === this.readSequence) {
        this.refreshing.set(false);
      }
    }
  }
}
