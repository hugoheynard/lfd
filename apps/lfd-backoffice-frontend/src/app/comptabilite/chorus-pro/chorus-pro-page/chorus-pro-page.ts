import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ChorusDepositState, ChorusInvoiceView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  type FoldBadgeVariant,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
  type FoldTableColumn,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { ChorusDepositsService, type ChorusQueue } from '../../chorus-deposits.service';
import { day, euros } from '../../invoice-dossier-format';
import { saveBlob } from '../../../shared/download/save-blob';
import {
  type ChorusGesture,
  ChorusGesturePanel,
  type ChorusGesturePanelData,
} from '../chorus-gesture-panel/chorus-gesture-panel';

const TO_DEPOSIT_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'payer', label: 'Payeur' },
  { key: 'invoice', label: 'Facture' },
  { key: 'issued', label: 'Date' },
  { key: 'commitment', label: 'Engagement' },
  { key: 'amount', label: 'Montant', numeric: true },
  { key: 'actions', label: 'Actions' },
];

const DEPOSITED_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'payer', label: 'Payeur' },
  { key: 'invoice', label: 'Facture' },
  { key: 'deposited', label: 'Déposée le' },
  { key: 'due', label: 'Échéance' },
  { key: 'state', label: 'État' },
  { key: 'amount', label: 'Montant', numeric: true },
  { key: 'actions', label: 'Actions' },
];

const STATE_LABELS: Readonly<Record<ChorusDepositState, string>> = {
  to_deposit: 'À déposer',
  deposited: 'Déposée',
  rejected: 'Rejetée',
  accepted: 'Mise en paiement',
};

const STATE_VARIANTS: Readonly<Record<ChorusDepositState, FoldBadgeVariant>> = {
  to_deposit: 'warning',
  deposited: 'info',
  rejected: 'alert',
  accepted: 'success',
};

const SUCCESS: Readonly<Record<ChorusGesture, string>> = {
  deposit: 'Dépôt noté',
  rejection: 'Rejet noté',
  acceptance: 'Mise en paiement notée',
};

/**
 * **Comptabilité › Chorus Pro** (plan `plan-clients-publics-chorus.md`,
 * § 6 quinquies) : les factures d'organismes publics à déposer à la main sur
 * le portail, puis celles déposées — leur échéance effective (dépôt + délai),
 * leur rejet, leur mise en paiement. Les gestes demandent
 * `b2b_accounting:write` ; l'écran les masque sans ce droit.
 */
@Component({
  selector: 'app-chorus-pro-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldNavLayoutComponent,
    FoldPageLayoutComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
  ],
  templateUrl: './chorus-pro-page.html',
})
export class ChorusProPage {
  private readonly api = inject(ChorusDepositsService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly toDeposit = signal<readonly ChorusInvoiceView[]>([]);
  protected readonly deposited = signal<readonly ChorusInvoiceView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly downloading = signal<string | null>(null);
  protected readonly tab = signal<ChorusQueue>('to-deposit');

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));
  protected readonly tabs = computed<readonly FoldTabItem<ChorusQueue>[]>(() => [
    { key: 'to-deposit', label: 'À déposer', badge: this.toDeposit().length },
    { key: 'deposited', label: 'Déposées', badge: this.deposited().length },
  ]);

  protected readonly toDepositColumns = TO_DEPOSIT_COLUMNS;
  protected readonly depositedColumns = DEPOSITED_COLUMNS;
  protected readonly euros = euros;
  protected readonly day = day;
  protected readonly rowKey = (row: ChorusInvoiceView): string => row.invoiceId;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [toDeposit, deposited] = await Promise.all([
        this.api.list('to-deposit'),
        this.api.list('deposited'),
      ]);
      this.toDeposit.set(toDeposit.invoices);
      this.deposited.set(deposited.invoices);
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les factures Chorus sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected stateLabel(state: ChorusDepositState): string {
    return STATE_LABELS[state];
  }

  protected stateVariant(state: ChorusDepositState): FoldBadgeVariant {
    return STATE_VARIANTS[state];
  }

  /** L'échéance effective, ou ce qui en tient lieu après un rejet. */
  protected dueOf(row: ChorusInvoiceView): string {
    const due = row.chorus.effectiveDueOn;
    if (due !== null) {
      return day(due);
    }
    return row.chorus.state === 'rejected' ? 'Aucune (rejetée)' : '—';
  }

  protected dayOrDash(isoDay: string | null): string {
    return isoDay === null ? '—' : day(isoDay);
  }

  protected commitmentOf(row: ChorusInvoiceView): string {
    const number = row.budgetCommitmentNumber;
    const service = row.budgetCommitmentServiceCode;
    if (number === null) {
      return service === null ? '—' : `Service ${service}`;
    }
    return service === null ? number : `${number} · service ${service}`;
  }

  /**
   * Le PDF à déposer sur le portail : un PDF ordinaire, sans le XML Factur-X,
   * que le portail refuse en dépôt manuel. L'exemplaire gardé ne change pas.
   */
  protected async download(row: ChorusInvoiceView): Promise<void> {
    this.downloading.set(row.invoiceId);
    try {
      saveBlob(await this.api.depositPdf(row.invoiceId), `${row.number}-chorus.pdf`);
    } catch (error) {
      this.notify.error(
        error,
        `Le PDF de la facture ${row.number} n’a pas pu être préparé. Réessayez dans un instant.`,
      );
    } finally {
      this.downloading.set(null);
    }
  }

  protected async open(gesture: ChorusGesture, invoice: ChorusInvoiceView): Promise<void> {
    const done = await this.panels.open<ChorusGesturePanelData, boolean>(ChorusGesturePanel, {
      data: { gesture, invoice },
      width: 'sm',
    }).closed;
    if (done !== true) {
      return;
    }
    this.notify.success(`${SUCCESS[gesture]} pour la facture ${invoice.number}.`);
    await this.load();
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par une méthode qui
  // rend la ligne typée.
  protected of(row: ChorusInvoiceView): ChorusInvoiceView {
    return row;
  }
}
