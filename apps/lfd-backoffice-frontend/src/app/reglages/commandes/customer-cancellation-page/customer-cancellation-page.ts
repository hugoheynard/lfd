import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  CUSTOMER_CANCELLATION_MAX_HOURS_BEFORE,
  type CustomerCancellationSettingsPatch,
  type CustomerCancellationSettingsView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { factWhen } from '../../../shared/journal/units';
import { CustomerCancellationService } from '../customer-cancellation.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Réglages › Commandes › Annulation de commande** (doc
 * `annulation-par-le-client.md`, C6.5 ; déplacée le 2026-10-13,
 * `plan-reglages-commandes.md` §3.1) —
 * si un délai est imposé aux particuliers (actif par défaut), et de combien
 * d'heures avant le début du créneau. Sans délai, ils annulent jusqu'à l'arrêt
 * du plan de production, comme les pros (décision de Hugo du 2026-10-13).
 *
 * L'écran ne décide rien : il pose le réglage, le serveur l'applique au geste
 * du client, et refuse un délai hors de 0 à 168 h avec sa phrase.
 */
@Component({
  selector: 'app-customer-cancellation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './customer-cancellation-page.html',
  styleUrl: './customer-cancellation-page.scss',
})
export class CustomerCancellationPage {
  private readonly service = inject(CustomerCancellationService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly maxHours = CUSTOMER_CANCELLATION_MAX_HOURS_BEFORE;

  /**
   * `PATCH /admin/customer-cancellation` exige `lfc_order_settings:write`
   * (depuis le 2026-10-13, plan-reglages-commandes.md §3.4) ; la page, la
   * lecture seule.
   */
  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<CustomerCancellationSettingsView | null>(null);
  /** Le brouillon : ce que l'écran montre, pas encore enregistré. */
  protected readonly delay = signal(true);
  /** `null` quand le champ est vidé (`fold-number-input`). */
  protected readonly hours = signal<number | null>(null);
  protected readonly saving = signal(false);
  /** Le dernier refus, en clair ; `null` quand le dernier envoi a abouti. */
  protected readonly failure = signal<string | null>(null);

  /** Ce qui diffère du réglage servi — seules ces clés partent. */
  protected readonly patch = computed<CustomerCancellationSettingsPatch | null>(() => {
    const served = this.settings();
    const hours = this.hours();
    if (served === null) {
      return null;
    }
    const patch: { delayEnabled?: boolean; hoursBefore?: number } = {};
    if (this.delay() !== served.delayEnabled) {
      patch.delayEnabled = this.delay();
    }
    if (this.delay() && hours !== null && hours !== served.hoursBefore) {
      patch.hoursBefore = hours;
    }
    return Object.keys(patch).length === 0 ? null : patch;
  });

  /** Un délai vidé ne s'enregistre pas : le serveur exige un entier. */
  protected readonly canSave = computed(
    () => this.patch() !== null && !(this.delay() && this.hours() === null) && !this.saving(),
  );

  /** « Hugo, le 13 octobre 2026 à 10:00 » ; `null` tant que personne n'a rien réglé. */
  protected readonly trace = computed<string | null>(() => {
    const served = this.settings();
    if (served === null || served.updatedAt === null) {
      return null;
    }
    const when = factWhen(served.updatedAt);
    return served.updatedBy === null ? `le ${when}` : `${served.updatedBy}, le ${when}`;
  });

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
    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.service.update(patch);
      this.apply(await this.service.read());
    } catch (error) {
      this.failure.set(
        httpErrorMessage(error, "Le réglage de l'annulation n'a pas pu être enregistré."),
      );
    } finally {
      this.saving.set(false);
    }
  }

  private apply(view: CustomerCancellationSettingsView): void {
    this.settings.set(view);
    this.delay.set(view.delayEnabled);
    this.hours.set(view.hoursBefore);
  }
}
