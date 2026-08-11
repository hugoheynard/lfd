import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { type Emplacement, type EmplacementTable } from '../../catalogue/catalogue-api';
import { slugify } from '../../data/sku';
import { EmplacementStore } from '../emplacement-store';
import {
  EmplacementFormPanel,
  type EmplacementPanelData,
} from '../emplacement-form-panel/emplacement-form-panel';
import { QrCode } from '../qr-code/qr-code';
import { qrSvgString } from '../qr-code/qr';

/**
 * La **liste des emplacements** — une carte par boutique. Elle lit le
 * {@link EmplacementStore} (backend), donc création / édition / suppression se
 * voient tout de suite. Chaque carte porte un menu (modifier / supprimer) qui
 * ouvre le side-panel ; les réglages ne s'éditent plus en place. La gestion des
 * QR de table (générer / retirer / exporter) reste sur la carte.
 */
@Component({
  selector: 'app-emplacement-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldButtonComponent,
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
  templateUrl: './emplacement-list.html',
  styleUrl: './emplacement-list.scss',
})
export class EmplacementList {
  private readonly store = inject(EmplacementStore);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Liste réactive : suit le store, donc les mutations du panel se voient direct. */
  protected readonly emplacements = this.store.items;

  /** Erreurs des actions QR (les mutations de la boutique remontent via le panel). */
  protected readonly error = signal<string | null>(null);

  protected modesLabel(emplacement: Emplacement): string {
    const modes: string[] = [];
    if (emplacement.clickCollect) {
      modes.push('Click & collect');
    }
    if (emplacement.surPlace) {
      modes.push('Sur place');
    }
    return modes.length === 0 ? 'Aucun mode actif' : modes.join(' · ');
  }

  /** URL de click & collect d'une table — `table` verrouillé, `k` = token
   *  rotatif (présent une fois le QR généré). */
  protected tableUrl(emplacement: Emplacement, table: EmplacementTable): string {
    const base = `${emplacement.baseUrl}?table=${table.number}`;
    return table.token === undefined ? base : `${base}&k=${table.token}`;
  }

  /** Édition : side-panel prérempli sur cette boutique. */
  protected openEdit(emplacement: Emplacement): void {
    this.openPanel({ mode: 'edit', emplacement });
  }

  /** Suppression : side-panel en zone dangereuse (confirmation par le nom). */
  protected openDelete(emplacement: Emplacement): void {
    this.openPanel({ mode: 'delete', emplacement });
  }

  private openPanel(data: EmplacementPanelData): void {
    this.panelHost.open(EmplacementFormPanel, { data, side: 'right' });
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
  protected exportQr(emplacement: Emplacement, table: EmplacementTable): void {
    if (typeof document === 'undefined') {
      return;
    }
    const svg = qrSvgString(this.tableUrl(emplacement, table));
    const filename = `qr-${slugify(emplacement.name)}-table-${table.number}.svg`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    try {
      await action();
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : 'Erreur inattendue.');
    }
  }
}
