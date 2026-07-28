import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

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

import {
  CatalogueApi,
  type Emplacement,
  type EmplacementTable,
} from '../../catalogue/catalogue-api';
import { LocalDb } from '../../data/local-db';
import { slugify } from '../../data/sku';
import {
  EmplacementFormPanel,
  type EmplacementPanelData,
} from '../emplacement-form-panel/emplacement-form-panel';
import { QrCode } from '../qr-code/qr-code';
import { qrSvgString } from '../qr-code/qr';

/**
 * La **liste des emplacements** — une carte par boutique. Elle lit en direct
 * depuis {@link LocalDb}, donc création / édition / suppression se voient tout
 * de suite. Chaque carte porte un menu (modifier / supprimer) qui ouvre le
 * side-panel ; les réglages ne s'éditent plus en place. La gestion des QR de
 * table (générer / retirer / exporter) reste sur la carte.
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
  private readonly api = inject(CatalogueApi);
  private readonly db = inject(LocalDb);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Liste réactive : suit la DB, donc les mutations du panel se voient direct. */
  protected readonly emplacements = computed<readonly Emplacement[]>(
    () => this.db.snapshot().emplacements,
  );

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

  /** Génère ou **régénère** : un nouveau token → nouveau QR, l'ancien devient
   *  caduc. Token minté à l'action (côté navigateur, jamais au rendu SSR). */
  protected async generateQr(id: string, tableNumber: number): Promise<void> {
    const token = `k${Math.random().toString(36).slice(2, 6)}`;
    await this.run(() => this.api.generateTableQr(id, tableNumber, token));
  }

  protected async removeQr(id: string, tableNumber: number): Promise<void> {
    await this.run(() => this.api.removeTableQr(id, tableNumber));
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
