import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { UnpaidTransferInvoicesView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import {
  BankTransferPanel,
  type BankTransferPanelData,
} from '../../comptabilite/bank-transfer-panel/bank-transfer-panel';
import { BankTransfersService } from '../../comptabilite/bank-transfers.service';
import { day, euros } from '../../comptabilite/invoice-dossier-format';
import { NotifyService } from '../../notify.service';

/**
 * **Les factures au virement à régler** de ce payeur (plan
 * `plan-paiement-au-compte-par-virement.md`, V7, V8) : chacune avec son
 * échéance et son retard — on le SIGNALE, rien ne bloque (Q2) — et le geste
 * « Virement reçu » pour qui écrit en comptabilité.
 *
 * Muette pour un payeur sans facture au virement non réglée : un client au
 * prélèvement n'a rien à y lire.
 */
@Component({
  selector: 'app-transfer-invoices-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './transfer-invoices-card.html',
  styleUrl: './transfer-invoices-card.scss',
})
export class TransferInvoicesCard {
  readonly companyId = input.required<string>();

  private readonly service = inject(BankTransfersService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly view = signal<UnpaidTransferInvoicesView | null>(null);
  protected readonly loadError = signal(false);

  protected readonly euros = euros;
  protected readonly day = day;

  protected readonly canRecord = computed(() => this.permissions.can('b2b_accounting:write'));
  protected readonly overdueCount = computed(
    () => this.view()?.invoices.filter((invoice) => invoice.overdue).length ?? 0,
  );

  constructor() {
    effect(() => {
      const id = this.companyId();
      untracked(() => void this.load(id));
    });
  }

  protected retry(): void {
    void this.load(this.companyId());
  }

  protected async record(): Promise<void> {
    const view = this.view();
    const [first] = view?.invoices ?? [];
    if (view === null || first === undefined) {
      return;
    }
    const data: BankTransferPanelData = { payerName: first.payerName, invoices: view.invoices };
    const done = await this.panels.open<BankTransferPanelData, boolean>(BankTransferPanel, {
      data,
      width: 'md',
    }).closed;
    if (done !== true) {
      return;
    }
    this.notify.success(`Virement enregistré pour ${first.payerName}.`);
    await this.load(this.companyId());
  }

  private async load(companyId: string): Promise<void> {
    this.loadError.set(false);
    try {
      this.view.set(await this.service.unpaid({ payerCompanyId: companyId }));
    } catch {
      this.loadError.set(true);
    }
  }
}
