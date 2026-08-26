import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldButtonIconComponent,
  FoldInlineConfirmComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import type { PointOfSaleView, TableView } from '@lfd/pim-contracts';
import { slugify } from '../../data/sku';
import { SalesContextStore } from '../../catalogue/sales-contexts/sales-context-store';
import { PointOfSaleStore } from '../point-of-sale-store';
import {
  PointOfSalePanel,
  type PointOfSalePanelData,
} from '../point-of-sale-panel/point-of-sale-panel';
import { QrCode } from '../../../shared/qr-code/qr-code';
import { qrSvgString } from '../../../shared/qr-code/qr';

/**
 * La **liste des points de vente** — une carte chacun, les deux genres mêlés.
 *
 * Ils étaient dans deux listes : les boutiques ici, les plateformes dans un
 * composant en lecture seule à côté. Deux listes pour une seule notion, et la
 * seconde disait « non modifiable » d'une chose qui, elle, se règle très bien —
 * seule sa SUPPRESSION est interdite, et seulement pour la racine.
 *
 * Elle lit le {@link PointOfSaleStore}, donc ouverture / réglage / fermeture se
 * voient tout de suite. La carte entière ouvre le réglage ; la gestion des QR de
 * table (générer / retirer / exporter) reste sur la carte.
 */
@Component({
  selector: 'app-point-of-sale-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldCalloutComponent,
    FoldButtonIconComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    QrCode,
  ],
  templateUrl: './point-of-sale-list.html',
  styleUrl: './point-of-sale-list.scss',
})
export class PointOfSaleList {
  private readonly store = inject(PointOfSaleStore);
  private readonly contexts = inject(SalesContextStore);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Liste réactive : suit le store, donc les mutations du panel se voient direct. */
  protected readonly pointsOfSale = this.store.items;
  /** Pourquoi la liste est vide — `null` = elle l'est vraiment. */
  protected readonly loadError = this.store.loadError;

  /** Erreurs des actions QR (les mutations de la boutique remontent via le panel). */
  protected readonly error = signal<string | null>(null);

  /**
   * Ce que le point de vente offre, en LIBELLÉS du registre.
   *
   * C'étaient deux drapeaux nommés ici même — « Click & collect » et « Sur
   * place ». Un troisième contexte demandait de livrer ce composant.
   */
  protected offerLabel(point: PointOfSaleView): string {
    const labels = new Map(this.contexts.items().map((context) => [context.key, context.label]));
    const offered = point.contexts.map((key) => labels.get(key) ?? key);
    return offered.length === 0 ? 'Aucun contexte offert' : offered.join(' · ');
  }

  /** URL de click & collect d'une table — `table` verrouillé, `k` = token
   *  rotatif (présent une fois le QR généré). */
  protected tableUrl(shop: PointOfSaleView, table: TableView): string {
    const base = `${shop.baseUrl ?? ''}?table=${table.number}`;
    return table.token === null ? base : `${base}&k=${table.token}`;
  }

  /**
   * Ouvre le réglage de cette boutique.
   *
   * Un seul geste : la suppression vit dans la zone dangereuse du panneau,
   * plus dans un menu qui rouvrait le même panneau dans un autre mode.
   */
  protected openEdit(pointOfSale: PointOfSaleView): void {
    const data: PointOfSalePanelData = { pointOfSale };
    this.panelHost.open(PointOfSalePanel, { data, side: 'right' });
  }

  /** Génère ou **régénère** : le backend mint un token neuf → nouveau QR,
   *  l'ancien devient caduc. */
  protected async generateQr(id: string, tableNumber: number): Promise<void> {
    await this.run(() => this.store.generateTableQr(id, tableNumber));
  }

  protected async removeQr(id: string, tableNumber: number): Promise<void> {
    await this.run(() => this.store.removeTableQr(id, tableNumber));
  }

  /** Export vectoriel nommé : `qr-{boutique}-table-N.svg`. */
  protected exportQr(shop: PointOfSaleView, table: TableView): void {
    if (typeof document === 'undefined') {
      return;
    }
    const svg = qrSvgString(this.tableUrl(shop, table));
    const filename = `qr-${slugify(shop.label)}-table-${table.number}.svg`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  /** Relance la lecture : le vide d'erreur propose de réessayer, pas de créer. */
  protected async retry(): Promise<void> {
    await this.run(() => this.store.reload());
  }

  /**
   * Le message est celui du référentiel, pas le `message` brut d'une
   * `HttpErrorResponse` — qui affichait « Http failure response for
   * http://… : 409 Conflict » là où le backend avait pris soin de dire quoi
   * faire.
   */
  private async run(action: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    try {
      await action();
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Opération refusée.'));
    }
  }
}
