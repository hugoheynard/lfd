import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { IssuedInvoiceLineView, IssuedInvoiceView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { day, euros, ratePercent, unitPrice } from '../invoice-dossier-format';
import { downloadIssuedInvoicePdf } from '../issued-invoice-pdf';
import { IssuedInvoicesService } from '../issued-invoices.service';
import {
  basisPointsPercent,
  kindLabel,
  periodLabel,
  quantityLabel,
} from '../issued-invoice-format';

type InvoiceState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * **Une facture émise**, telle qu'elle est figée (plan
 * `plan-emission-de-la-facture.md`, E6) : parties, lignes, ventilation par
 * taux, mentions, bons couverts. Rien n'est recalculé.
 *
 * Elle ne reprend pas `app-dossier-invoice` : celui-ci lit la facture
 * SIMULÉE, qui détaille remises et frais par nature ; une pièce émise ne
 * fige que leurs parts par taux. Les mises en forme, elles, sont les mêmes
 * (`invoice-dossier-format.ts`). Le PDF/A-3 Factur-X se télécharge d'ici une
 * fois rendu (E3b) ; tant qu'il ne l'est pas, la pièce le dit. Une facture
 * (pas un avoir) peut renvoyer son e-mail « Votre facture » (suite (b)).
 */
@Component({
  selector: 'app-facture-emise-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './facture-emise-page.html',
  styleUrl: './facture-emise-page.scss',
})
export class FactureEmisePage {
  private readonly api = inject(IssuedInvoicesService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  /** Le segment `:id` de la route. */
  readonly id = input.required<string>();

  protected readonly state = signal<InvoiceState>('loading');
  protected readonly invoice = signal<IssuedInvoiceView | null>(null);
  protected readonly downloading = signal(false);
  protected readonly resending = signal(false);

  /** Le renvoi de « Votre facture » : une facture (pas un avoir), et le droit d'écrire. */
  protected readonly canResend = computed(
    () => this.invoice()?.kind === 'invoice' && this.permissions.can('b2b_accounting:write'),
  );

  protected readonly title = computed(() => {
    const invoice = this.invoice();
    return invoice === null ? 'Facture' : `${kindLabel(invoice.kind)} ${invoice.number}`;
  });

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'label', label: 'Produit' },
    { key: 'rate', label: 'TVA', numeric: true },
    { key: 'quantity', label: 'Quantité', numeric: true },
    { key: 'unit', label: 'Prix unitaire HT', numeric: true },
    { key: 'amount', label: 'Montant HT', numeric: true },
  ];

  protected readonly rowKey = (line: IssuedInvoiceLineView): string =>
    `${line.sku}|${String(line.unitPriceMillicents)}|${String(line.vatRate)}`;

  protected readonly euros = euros;
  protected readonly day = day;
  protected readonly rate = ratePercent;
  protected readonly unitPrice = unitPrice;
  protected readonly quantity = quantityLabel;
  protected readonly period = periodLabel;
  protected readonly percent = basisPointsPercent;

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async downloadCurrent(): Promise<void> {
    const invoice = this.invoice();
    if (invoice === null) {
      return;
    }
    this.downloading.set(true);
    await downloadIssuedInvoicePdf(this.api, this.notify, invoice);
    this.downloading.set(false);
  }

  /** Renvoie l'e-mail « Votre facture » aux destinataires d'aujourd'hui (E6, suite (b)). */
  protected async resendNotice(): Promise<void> {
    const invoice = this.invoice();
    if (invoice === null || this.resending()) {
      return;
    }
    this.resending.set(true);
    try {
      await this.api.resendNotice(invoice.invoiceId);
      this.notify.success(`L’e-mail de la facture ${invoice.number} est reparti.`);
    } catch (error) {
      this.notify.error(
        error,
        `L’e-mail de la facture ${invoice.number} n’a pas pu être renvoyé. Réessayez dans un instant.`,
      );
    } finally {
      this.resending.set(false);
    }
  }

  protected async load(id: string): Promise<void> {
    this.state.set('loading');
    try {
      this.invoice.set(await this.api.one(id));
      this.state.set('ready');
    } catch (caught) {
      this.invoice.set(null);
      this.state.set(
        caught instanceof HttpErrorResponse && caught.status === 404 ? 'not-found' : 'error',
      );
    }
  }
}
