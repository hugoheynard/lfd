import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OrderCutoffSettingsPatch, OrderCutoffSettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Les relances d'un retrait en retard** — sur la page de l'heure limite
 * (Hugo, 2026-10-25) : combien de minutes après la FIN DU CRÉNEAU la
 * Supervision propose « Rappel au client » (la commande prête attend, le
 * client n'est pas venu) et « Avertir le client » (la commande n'est pas
 * prête). 0 par défaut : dès la fin du créneau.
 *
 * L'écran ne décide rien : il pose les deux délais, la Supervision n'affiche
 * le bouton qu'après, et le serveur refuse le geste avant (409), comme un
 * délai négatif ou non entier (400). Même droit que la page,
 * `lfc_order_settings`.
 */
@Component({
  selector: 'app-customer-nudge-delays-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './customer-nudge-delays-card.html',
  styleUrl: './customer-nudge-delays-card.scss',
})
export class CustomerNudgeDelaysCard {
  private readonly service = inject(OrderCutoffSettingsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<OrderCutoffSettingsView | null>(null);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);
  /** Les brouillons ; `null` quand le champ est vidé (`fold-number-input`). */
  protected readonly reminder = signal<number | null>(null);
  protected readonly warning = signal<number | null>(null);

  /** Ce qui diffère du réglage servi — seules ces clés partent. */
  protected readonly patch = computed<OrderCutoffSettingsPatch | null>(() => {
    const served = this.settings();
    const reminder = this.reminder();
    const warning = this.warning();
    if (served === null) {
      return null;
    }
    const patch: { pickupReminderDelayMinutes?: number; delayWarningDelayMinutes?: number } = {};
    if (reminder !== null && reminder !== served.pickupReminderDelayMinutes) {
      patch.pickupReminderDelayMinutes = reminder;
    }
    if (warning !== null && warning !== served.delayWarningDelayMinutes) {
      patch.delayWarningDelayMinutes = warning;
    }
    return Object.keys(patch).length === 0 ? null : patch;
  });

  /** Un champ vidé ne s'enregistre pas : le serveur exige un entier. */
  protected readonly canSave = computed(
    () =>
      this.patch() !== null &&
      this.reminder() !== null &&
      this.warning() !== null &&
      !this.pending(),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.apply(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Revient au réglage servi. */
  protected reset(): void {
    const served = this.settings();
    if (served !== null) {
      this.apply(served);
    }
    this.failure.set(null);
  }

  /** Envoie ce qui a changé, puis relit. Un refus garde le brouillon, avec la raison. */
  protected async save(): Promise<void> {
    const patch = this.patch();
    if (patch === null || !this.canSave()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.service.update(patch);
      this.apply(await this.service.read());
    } catch (error) {
      this.failure.set(httpErrorMessage(error, 'Les délais n’ont pas pu être enregistrés.'));
    } finally {
      this.pending.set(false);
    }
  }

  private apply(view: OrderCutoffSettingsView): void {
    this.settings.set(view);
    this.reminder.set(view.pickupReminderDelayMinutes);
    this.warning.set(view.delayWarningDelayMinutes);
  }
}
