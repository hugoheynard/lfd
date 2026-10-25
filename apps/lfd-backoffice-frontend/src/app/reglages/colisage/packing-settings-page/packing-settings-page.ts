import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { PackingSettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PackingSettingsService } from '../../../production/packing-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Réglages › Colisage** (Hugo, 2026-10-25 : « partager une moitié devrait
 * être un réglage dans réglages/colisage, on devrait commencer avec ça
 * désactivé »). Un interrupteur : le partage d'une moitié de bac au poste.
 *
 * Sous `delivery_settings`, le droit des bacs et des contenances — la page se
 * fige sans `:write`. Chaque bascule s'applique tout de suite, puis relit :
 * l'écran ne décide rien, le serveur refuse le geste quand c'est fermé.
 */
@Component({
  selector: 'app-packing-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './packing-settings-page.html',
})
export class PackingSettingsPage {
  private readonly service = inject(PackingSettingsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_settings:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<PackingSettingsView | null>(null);
  protected readonly shown = computed<readonly PackingSettingsView[]>(() => {
    const view = this.settings();
    return view === null ? [] : [view];
  });
  protected readonly saving = signal(false);
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

  /** Bascule le partage d'une moitié, puis relit. Un refus laisse l'état servi, avec la raison. */
  protected async setHalfSharing(halfSharing: boolean): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.service.update({ halfSharing });
      this.settings.set(await this.service.read());
    } catch (error) {
      this.failure.set(
        httpErrorMessage(error, "Le réglage du colisage n'a pas pu être enregistré."),
      );
      // La case revient à l'état servi : rien n'a été appliqué.
      this.settings.update((view) => (view === null ? null : { ...view }));
    } finally {
      this.saving.set(false);
    }
  }
}
