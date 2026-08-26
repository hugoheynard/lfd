import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import type { PointOfSaleView, TableView } from '@lfd/pim-contracts';
import { slugify } from '../../data/sku';
import { SalesContextStore } from '../../catalogue/sales-contexts/sales-context-store';
import { PointOfSaleStore } from '../point-of-sale-store';
import { ShopFormPanel, type ShopPanelData } from '../shop-form-panel/shop-form-panel';
import { QrCode } from '../../../shared/qr-code/qr-code';
import { qrSvgString } from '../../../shared/qr-code/qr';

/**
 * La **liste des boutiques** — une carte chacune. Elle lit le
 * {@link PointOfSaleStore} (backend), donc création / édition / suppression se
 * voient tout de suite. Chaque carte porte un menu (modifier / supprimer) qui
 * ouvre le side-panel ; les réglages ne s'éditent plus en place. La gestion des
 * QR de table (générer / retirer / exporter) reste sur la carte.
 *
 * Les **plateformes** ne sont pas ici : elles ne s'ouvrent ni ne se ferment, et
 * {@link PlatformList} les rend en lecture.
 */
@Component({
  selector: 'app-shop-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldCalloutComponent,
    FoldIconComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldPopoverTriggerDirective,
    QrCode,
  ],
  templateUrl: './shop-list.html',
  styleUrl: './shop-list.scss',
})
export class ShopList {
  private readonly store = inject(PointOfSaleStore);
  private readonly contexts = inject(SalesContextStore);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Liste réactive : suit le store, donc les mutations du panel se voient direct. */
  protected readonly shops = this.store.shops;
  /** Pourquoi la liste est vide — `null` = elle l'est vraiment. */
  protected readonly loadError = this.store.loadError;

  /** Erreurs des actions QR (les mutations de la boutique remontent via le panel). */
  protected readonly error = signal<string | null>(null);

  /**
   * Ce que la boutique offre, en LIBELLÉS du registre.
   *
   * C'étaient deux drapeaux nommés ici même — « Click & collect » et « Sur
   * place ». Un troisième contexte demandait de livrer ce composant.
   */
  protected offerLabel(shop: PointOfSaleView): string {
    const labels = new Map(this.contexts.items().map((context) => [context.key, context.label]));
    const offered = shop.contexts.map((key) => labels.get(key) ?? key);
    return offered.length === 0 ? 'Aucun contexte offert' : offered.join(' · ');
  }

  /** URL de click & collect d'une table — `table` verrouillé, `k` = token
   *  rotatif (présent une fois le QR généré). */
  protected tableUrl(shop: PointOfSaleView, table: TableView): string {
    const base = `${shop.baseUrl ?? ''}?table=${table.number}`;
    return table.token === null ? base : `${base}&k=${table.token}`;
  }

  /** Édition : side-panel prérempli sur cette boutique. */
  protected openEdit(shop: PointOfSaleView): void {
    this.openPanel({ mode: 'edit', shop });
  }

  /** Suppression : side-panel en zone dangereuse (confirmation par le nom). */
  protected openDelete(shop: PointOfSaleView): void {
    this.openPanel({ mode: 'delete', shop });
  }

  private openPanel(data: ShopPanelData): void {
    this.panelHost.open(ShopFormPanel, { data, side: 'right' });
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
