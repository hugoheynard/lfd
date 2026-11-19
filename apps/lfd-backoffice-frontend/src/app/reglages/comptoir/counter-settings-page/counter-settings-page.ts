import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CounterSettingsView, CounterSiteSettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CounterSettingsService } from '../counter-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

const MODIFIED_AT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * **Réglages › Comptoir** — suivre l'état du stock au comptoir, point par
 * point, désactivé par défaut (décidé par Hugo le 2026-11-19). Une case par
 * point ; chaque bascule s'applique tout de suite, puis relit.
 *
 * Sous `lfc_order_settings`, comme les routes `admin/counter-settings` : la
 * page se fige sans `:write`.
 */
@Component({
  selector: 'app-counter-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './counter-settings-page.html',
})
export class CounterSettingsPage {
  private readonly service = inject(CounterSettingsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<CounterSettingsView | null>(null);
  protected readonly sites = computed(() => this.settings()?.sites ?? []);
  /** Le point dont la bascule est en cours ; `null` sinon. */
  protected readonly saving = signal<string | null>(null);
  /** Le dernier refus, en clair ; `null` quand le dernier envoi a abouti. */
  protected readonly failure = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.settings.set(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** « Modifié par X, le … », ou le défaut d'un point jamais réglé. */
  protected lastChange(site: CounterSiteSettingsView): string {
    if (site.updatedAt === null) {
      return 'Jamais réglé : désactivé par défaut.';
    }
    const when = MODIFIED_AT.format(new Date(site.updatedAt));
    return site.updatedBy === null
      ? `Modifié le ${when}.`
      : `Modifié par ${site.updatedBy}, le ${when}.`;
  }

  /** Bascule le suivi d'un point, puis relit. Un refus laisse l'état servi, avec la raison. */
  protected async setStockTracking(
    site: CounterSiteSettingsView,
    stockTracking: boolean,
  ): Promise<void> {
    if (this.saving() !== null) {
      return;
    }
    this.saving.set(site.siteId);
    this.failure.set(null);
    try {
      await this.service.setStockTracking(site.siteId, { stockTracking });
      this.settings.set(await this.service.read());
    } catch (error) {
      this.failure.set(
        httpErrorMessage(
          error,
          `Le suivi du stock de « ${site.siteLabel} » n'a pas pu être enregistré.`,
        ),
      );
      // La case revient à l'état servi : des lignes neuves recréent les cases.
      this.settings.update((view) =>
        view === null ? null : { sites: view.sites.map((line) => ({ ...line })) },
      );
    } finally {
      this.saving.set(null);
    }
  }
}
