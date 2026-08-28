import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
} from 'fold-ng';

import {
  companyDisplayName,
  settlementSummary,
  type Company,
} from '../../../account/account.model';
import { CommerceContextService } from '../../commerce/commerce-context.service';
import { formatEurValue } from '../../data/catalogue-seed';
import { downloadBon as downloadBonFile } from '../download-bon';
import { orderStatusLabel, orderStatusVariant } from '@lfd/b2b-ui/order';
import { buildDemoOrders, type CommandeRow } from '../orders-demo-seed';

/** Une entreprise gérée et ses commandes — un bloc de la vue « Toutes les commandes ». */
interface CompanyOrders {
  readonly company: Company;
  readonly orders: readonly CommandeRow[];
}

/**
 * **Toutes les commandes** — la lecture exhaustive en table, **par entreprise
 * gérée** : un bloc par société (nom, référence, régime de règlement) puis sa
 * table de commandes. C'est la seconde vue du view-toggle de « Mes commandes ».
 *
 * Front-only : les lignes viennent du seed démo (`orders-demo-seed`).
 */
@Component({
  selector: 'app-orders-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
  ],
  templateUrl: './orders-table.html',
  styleUrl: './orders-table.scss',
})
export class OrdersTable {
  private readonly context = inject(CommerceContextService);

  /** Année de filtrage (pagination) ; `null` = toutes les années. */
  readonly year = input<number | null>(null);

  /** Toutes les entreprises gérées, chacune avec ses commandes de l'année filtrée. */
  protected readonly groups = computed<readonly CompanyOrders[]>(() => {
    const year = this.year();
    return this.context.companies().map((company) => {
      const orders = buildDemoOrders(company).filter(
        (order) => year === null || new Date(order.date).getFullYear() === year,
      );
      return { company, orders };
    });
  });

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'reference', label: 'Référence', width: '11rem' },
    { key: 'date', label: 'Date', width: '8rem' },
    { key: 'deliveryPlace', label: 'Lieu de livraison' },
    { key: 'status', label: 'Statut', width: '9rem' },
    { key: 'total', label: 'Total', align: 'right', width: '7rem' },
    { key: 'actions', label: '', align: 'right', width: '10rem' },
  ];

  protected readonly rowKey = (row: CommandeRow): string => row.id;

  protected readonly emptyState = {
    title: 'Aucune commande',
    subtitle: 'Les commandes de cet établissement apparaîtront ici.',
  };

  /** Références dont le règlement immédiat a été demandé (stub front-only). */
  protected readonly settleAsked = signal<ReadonlySet<string>>(new Set());

  protected readonly statusLabel = orderStatusLabel;
  protected readonly statusVariant = orderStatusVariant;
  protected readonly companyName = companyDisplayName;
  protected readonly termsLabel = settlementSummary;

  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }

  protected isSettleAsked(id: string): boolean {
    return this.settleAsked().has(id);
  }

  /** Demande de règlement immédiat d'une commande — stub front-only (marque la ligne). */
  protected askSettle(row: CommandeRow): void {
    this.settleAsked.update((set) => new Set(set).add(row.id));
  }

  protected downloadBon(row: CommandeRow): void {
    downloadBonFile(row);
  }
}
