import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import {
  type FoldBadgeVariant,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldContextCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldSpinnerComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

import {
  type ChannelMode,
  ShopifyChannelApi,
  type ShopifyProductSnapshot,
} from '../../channels/shopify-channel-api';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * **État de la boutique** — lit et affiche le catalogue tel qu'il existe *aujourd'hui*
 * sur Shopify (lecture seule). On charge à la demande : c'est une photo du distant,
 * utile avant de pousser pour repérer ce qui existe déjà. En `dry-run`, il n'y a rien
 * à lire — on invite à connecter la boutique.
 */
@Component({
  selector: 'app-shopify-catalogue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldContextCardComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldButtonComponent,
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldSpinnerComponent,
  ],
  templateUrl: './shopify-catalogue.html',
  styleUrl: './shopify-catalogue.scss',
})
export class ShopifyCatalogue {
  private readonly api = inject(ShopifyChannelApi);

  protected readonly state = signal<LoadState>('idle');
  protected readonly products = signal<readonly ShopifyProductSnapshot[]>([]);
  protected readonly mode = signal<ChannelMode>('dry-run');
  protected readonly error = signal<string | null>(null);

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'title', label: 'Produit' },
    { key: 'handle', label: 'Handle', width: '16rem', truncate: true },
    { key: 'status', label: 'Statut', width: '9rem' },
    { key: 'variants', label: 'Déclinaisons', align: 'right', width: '9rem' },
  ];

  protected readonly emptyState: FoldTableEmpty = {
    title: 'Aucun produit',
    subtitle: 'La boutique ne contient aucun produit pour le moment.',
  };

  protected readonly rowKey = (product: ShopifyProductSnapshot): string =>
    product.id;

  protected async load(): Promise<void> {
    this.state.set('loading');
    this.error.set(null);
    try {
      const result = await this.api.inspectCatalogue();
      this.mode.set(result.mode);
      this.products.set(result.products);
      this.state.set('loaded');
    } catch {
      this.error.set(
        'Backend PIM injoignable — démarrez lfc-PIM-backend (port 3100).',
      );
      this.state.set('error');
    }
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'ACTIVE':
        return 'Actif';
      case 'DRAFT':
        return 'Brouillon';
      case 'ARCHIVED':
        return 'Archivé';
      default:
        return status;
    }
  }

  protected statusVariant(status: string): FoldBadgeVariant {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'DRAFT':
        return 'warning';
      default:
        return 'neutral';
    }
  }
}
