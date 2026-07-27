import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import {
  CatalogueApi,
  type Emplacement,
  type EmplacementTable,
} from '../catalogue/catalogue-api';
import { slugify } from '../data/sku';
import { QrCode } from './qr-code/qr-code';
import { qrSvgString } from './qr-code/qr';

/**
 * Admin **Emplacements** — on crée des boutiques, on choisit leurs modes
 * (click & collect, sur place). Le sur place ouvre un nombre de tables ; chaque
 * table reçoit une URL de click & collect (numéro verrouillé) et un QR.
 */
@Component({
  selector: 'app-emplacements-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    QrCode,
  ],
  templateUrl: './emplacements-page.html',
  styleUrl: './emplacements-page.scss',
})
export class EmplacementsPage {
  private readonly api = inject(CatalogueApi);

  protected readonly emplacements = signal<Emplacement[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  // Brouillon de création.
  protected readonly draftName = signal('');
  protected readonly draftClickCollect = signal(true);
  protected readonly draftSurPlace = signal(false);
  protected readonly draftTables = signal<number | null>(0);
  protected readonly draftBaseUrl = signal('');

  /** Emplacements dont le panneau « Paramètres » est ouvert. */
  private readonly editing = signal<ReadonlySet<string>>(new Set());

  constructor() {
    void this.reload();
  }

  protected isEditing(id: string): boolean {
    return this.editing().has(id);
  }

  protected toggleEdit(id: string): void {
    this.editing.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

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

  protected tableCountOf(emplacement: Emplacement): number {
    return emplacement.tables.length;
  }

  protected val(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  protected num(event: Event): number | null {
    const parsed = Number(this.val(event));
    return Number.isFinite(parsed) ? parsed : null;
  }

  protected async create(): Promise<void> {
    if (this.draftName().trim() === '') {
      return;
    }
    await this.run(async () => {
      await this.api.createEmplacement({
        name: this.draftName(),
        clickCollect: this.draftClickCollect(),
        surPlace: this.draftSurPlace(),
        tableCount: this.draftTables() ?? 0,
        baseUrl: this.draftBaseUrl(),
      });
      this.draftName.set('');
      this.draftBaseUrl.set('');
      this.draftSurPlace.set(false);
      this.draftTables.set(0);
    });
  }

  protected async remove(id: string): Promise<void> {
    await this.run(() => this.api.deleteEmplacement(id));
  }

  protected async setBaseUrl(id: string, baseUrl: string): Promise<void> {
    await this.run(() => this.api.updateEmplacement(id, { baseUrl }));
  }

  protected async setName(id: string, name: string): Promise<void> {
    await this.run(() => this.api.updateEmplacement(id, { name }));
  }

  protected async toggleClickCollect(id: string, clickCollect: boolean): Promise<void> {
    await this.run(() => this.api.updateEmplacement(id, { clickCollect }));
  }

  protected async toggleSurPlace(id: string, surPlace: boolean): Promise<void> {
    await this.run(() => this.api.updateEmplacement(id, { surPlace }));
  }

  protected async setTableCount(id: string, count: number | null): Promise<void> {
    await this.run(() =>
      this.api.updateEmplacement(id, { tableCount: count ?? 0 }),
    );
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
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    this.emplacements.set(await this.api.listEmplacements());
  }
}
