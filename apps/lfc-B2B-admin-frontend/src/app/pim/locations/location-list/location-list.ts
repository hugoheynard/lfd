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

import type { Location, LocationTable } from '../../data/models';
import { slugify } from '../../data/sku';
import { LocationStore } from '../location-store';
import {
  LocationFormPanel,
  type LocationPanelData,
} from '../location-form-panel/location-form-panel';
import { QrCode } from '../../../shared/qr-code/qr-code';
import { qrSvgString } from '../../../shared/qr-code/qr';

/**
 * La **liste des emplacements** — une carte par boutique. Elle lit le
 * {@link LocationStore} (backend), donc création / édition / suppression se
 * voient tout de suite. Chaque carte porte un menu (modifier / supprimer) qui
 * ouvre le side-panel ; les réglages ne s'éditent plus en place. La gestion des
 * QR de table (générer / retirer / exporter) reste sur la carte.
 */
@Component({
  selector: 'app-location-list',
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
  templateUrl: './location-list.html',
  styleUrl: './location-list.scss',
})
export class LocationList {
  private readonly store = inject(LocationStore);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Liste réactive : suit le store, donc les mutations du panel se voient direct. */
  protected readonly locations = this.store.items;
  /** Pourquoi la liste est vide — `null` = elle l'est vraiment. */
  protected readonly loadError = this.store.loadError;

  /** Erreurs des actions QR (les mutations de la boutique remontent via le panel). */
  protected readonly error = signal<string | null>(null);

  protected modesLabel(location: Location): string {
    const modes: string[] = [];
    if (location.clickCollect) {
      modes.push('Click & collect');
    }
    if (location.surPlace) {
      modes.push('Sur place');
    }
    return modes.length === 0 ? 'Aucun mode actif' : modes.join(' · ');
  }

  /** URL de click & collect d'une table — `table` verrouillé, `k` = token
   *  rotatif (présent une fois le QR généré). */
  protected tableUrl(location: Location, table: LocationTable): string {
    const base = `${location.baseUrl}?table=${table.number}`;
    return table.token === undefined ? base : `${base}&k=${table.token}`;
  }

  /** Édition : side-panel prérempli sur cette boutique. */
  protected openEdit(location: Location): void {
    this.openPanel({ mode: 'edit', location });
  }

  /** Suppression : side-panel en zone dangereuse (confirmation par le nom). */
  protected openDelete(location: Location): void {
    this.openPanel({ mode: 'delete', location });
  }

  private openPanel(data: LocationPanelData): void {
    this.panelHost.open(LocationFormPanel, { data, side: 'right' });
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
  protected exportQr(location: Location, table: LocationTable): void {
    if (typeof document === 'undefined') {
      return;
    }
    const svg = qrSvgString(this.tableUrl(location, table));
    const filename = `qr-${slugify(location.name)}-table-${table.number}.svg`;
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
