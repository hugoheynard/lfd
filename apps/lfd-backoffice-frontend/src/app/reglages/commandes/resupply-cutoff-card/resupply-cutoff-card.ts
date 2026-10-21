import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { clockTimeSchema, type OrderCutoffSettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **L'heure limite du réassort boutique** — sur la page de l'heure limite
 * (lot R3a, `reassort-boutiques/plan-reapprovisionnement.md` §13.3, Hugo
 * 2026-10-21) : « la veille, HH:MM », 20:00 par défaut.
 *
 * Elle remplace l'interrupteur « soumis / sans limite » : passé cette heure,
 * le réassort « Pour demain » est refusé, et le plan du fournil s'arrête à la
 * plus tardive de cette heure et de l'heure limite générale (rattrapage
 * compris). « Au plus tôt » n'y est jamais soumis. Même droit que la page,
 * `lfc_order_settings`.
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
  /** L'heure saisie, `null` tant qu'on n'a pas touché au champ. */
  protected readonly draft = signal<string | null>(null);

  protected readonly current = computed(() => this.settings()?.resupplyCutoffTime ?? '');
  protected readonly time = computed(() => this.draft() ?? this.current());
  protected readonly timeIsValid = computed(() => clockTimeSchema.safeParse(this.time()).success);
  protected readonly canSave = computed(
    () => this.timeIsValid() && this.time() !== this.current() && !this.pending(),
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

  protected onTime(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  /** Enregistre l'heure, puis relit. Un refus laisse l'heure servie, avec la raison. */
  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.service.update({ resupplyCutoffTime: this.time() });
      this.settings.set(await this.service.read());
      this.draft.set(null);
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "L'heure n'a pas pu être enregistrée."));
    } finally {
      this.pending.set(false);
    }
  }
}
