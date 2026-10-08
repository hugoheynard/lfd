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

import { day, euros, ratePercent, unitPrice } from '../invoice-dossier-format';
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
 * (`invoice-dossier-format.ts`). Aucun PDF tant que le rendu (E3b) n'existe pas.
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

  /** Le segment `:id` de la route. */
  readonly id = input.required<string>();

  protected readonly state = signal<InvoiceState>('loading');
  protected readonly invoice = signal<IssuedInvoiceView | null>(null);

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
