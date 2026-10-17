import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { SiteTableView, SiteView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { QrCode } from '../../../../shared/qr-code/qr-code';
import { qrSvgString } from '../../../../shared/qr-code/qr';
import { SitesService } from '../../sites.service';

type LoadState = 'loading' | 'ready' | 'error';

/** La borne de l'agrégat `SiteTables` (`MAX_SITE_TABLES`, relu le 2026-10-17). */
const MAX_TABLES = 200;

/**
 * **Les tables de la salle d'un site** (Hugo, 2026-10-17, plan
 * `documentation/sites/sites.md` §6 bis) — montrée
 * seulement pour un site « Sur place », avec SA sauvegarde.
 *
 * Le nombre de tables s'enregistre seul ; chaque QR se génère ou se retire
 * table par table. Le QR encode l'adresse que le serveur compose (le jeton,
 * unique, désigne seul le site et la table) : l'écran ne la fabrique pas.
 * Aucune route ne la sert encore — pas de commande à table.
 */
@Component({
  selector: 'app-site-tables-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageSectionComponent,
    QrCode,
  ],
  templateUrl: './site-tables-card.html',
  styleUrl: './site-tables-card.scss',
})
export class SiteTablesCard {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);

  readonly site = input.required<SiteView>();
  readonly readOnly = input(false);

  protected readonly maxTables = MAX_TABLES;
  protected readonly state = signal<LoadState>('loading');
  protected readonly tables = signal<readonly SiteTableView[]>([]);
  protected readonly count = signal<number | null>(0);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly countDirty = computed(() => this.count() !== this.tables().length);
  protected readonly canSaveCount = computed(() => {
    const count = this.count();
    return !this.readOnly() && !this.busy() && count !== null && this.countDirty();
  });

  constructor() {
    effect(() => {
      void this.load(this.site().id);
    });
  }

  protected async load(id: string): Promise<void> {
    this.state.set('loading');
    try {
      this.apply((await this.sites.tables(id)).tables);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async saveCount(): Promise<void> {
    const count = this.count();
    if (!this.canSaveCount() || count === null) {
      return;
    }
    await this.run(
      () => this.sites.setTableCount(this.site().id, count),
      'Nombre de tables enregistré.',
    );
  }

  protected async generateQr(tableNumber: number): Promise<void> {
    await this.run(
      () => this.sites.generateTableQr(this.site().id, tableNumber),
      `QR de la table ${tableNumber} généré.`,
    );
  }

  protected async removeQr(tableNumber: number): Promise<void> {
    await this.run(
      () => this.sites.removeTableQr(this.site().id, tableNumber),
      `QR de la table ${tableNumber} retiré.`,
    );
  }

  /** Export vectoriel nommé : `qr-table-N.svg`, prêt à imprimer. */
  protected exportQr(table: SiteTableView): void {
    if (typeof document === 'undefined' || table.qrUrl === null) {
      return;
    }
    const blob = new Blob([qrSvgString(table.qrUrl)], { type: 'image/svg+xml' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `qr-table-${table.number}.svg`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  private apply(tables: readonly SiteTableView[]): void {
    this.tables.set(tables);
    this.count.set(tables.length);
  }

  /** Écrit, puis relit la grille ; un refus reste affiché avec les mots du serveur. */
  private async run(write: () => Promise<void>, success: string): Promise<void> {
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await write();
      this.apply((await this.sites.tables(this.site().id)).tables);
      this.notify.success(success);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "La grille de tables n'a pas pu être enregistrée."));
    } finally {
      this.busy.set(false);
    }
  }
}
