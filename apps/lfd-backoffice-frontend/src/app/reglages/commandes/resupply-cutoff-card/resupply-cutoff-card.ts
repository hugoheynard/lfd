import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OrderCutoffSettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **La limite du réassort boutique** — sur la page de l'heure limite (Hugo,
 * 2026-10-21 : « la limite ou absence de limite [du réassort] devrait être
 * définie dans les réglages limites »).
 *
 * Opposée depuis le lot R1 (2026-10-21) au réassort commandé « Pour demain »
 * (`reassort-boutiques/README.md`) ; « Au plus tôt » n'y est jamais soumis.
 * Même droit que la page, `lfc_order_settings`.
 */
@Component({
  selector: 'app-resupply-cutoff-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './resupply-cutoff-card.html',
  styleUrl: './resupply-cutoff-card.scss',
})
export class ResupplyCutoffCard {
  private readonly service = inject(OrderCutoffSettingsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<OrderCutoffSettingsView | null>(null);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly subject = computed(() => this.settings()?.resupplySubjectToCutoff ?? true);
  protected readonly effect = computed(() =>
    this.subject()
      ? 'Le réassort boutique pourra être demandé au fournil à toute heure, une fois cette commande bâtie.'
      : 'Le réassort boutique suivra l’heure limite générale, une fois sa commande au fournil bâtie.',
  );

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

  /** Bascule, puis relit. Un refus laisse l'état servi, avec la raison. */
  protected async toggle(): Promise<void> {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.service.update({ resupplySubjectToCutoff: !this.subject() });
      this.settings.set(await this.service.read());
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le réglage n'a pas pu être enregistré."));
    } finally {
      this.pending.set(false);
    }
  }
}
