import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import type { ActivationSupportPayload, SupportChannel, SupportSlot } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import { AccountService } from '../../account/account.service';
import { SupportService } from '../support.service';

/** Charge d'ouverture : l'entreprise concernée. */
export interface SupportPanelData {
  readonly companyId: string;
}

/**
 * Panneau **Demande de support à l'activation** — le client demande à être
 * contacté par l'équipe commerciale : rappel téléphonique (à son numéro ou un
 * autre, au plus vite ou sur un créneau daté) ou échange par e-mail.
 */
@Component({
  selector: 'app-activation-support-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldSelectComponent,
    FoldCheckboxComponent,
    FoldInputComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
  ],
  templateUrl: './activation-support-panel.html',
  styleUrl: './activation-support-panel.scss',
})
export class ActivationSupportPanel {
  private readonly account = inject(AccountService);
  private readonly support = inject(SupportService);
  private readonly ref = inject(FoldPanelRef);

  readonly data = input<SupportPanelData | undefined>(undefined);

  private readonly profile = this.account.profile;
  protected readonly profilePhone = computed(() => this.profile()?.phone.trim() ?? '');
  protected readonly profileEmail = computed(() => this.profile()?.email ?? '');
  protected readonly hasProfilePhone = computed(() => this.profilePhone() !== '');

  protected readonly channel = signal<SupportChannel>('phone');
  protected readonly useOtherNumber = signal(false);
  protected readonly customPhone = signal('');
  protected readonly asap = signal(true);
  protected readonly scheduledDate = signal('');
  protected readonly slot = signal<SupportSlot>('morning');
  protected readonly message = signal('');

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** Une fois la demande envoyée : on montre la confirmation. */
  protected readonly placed = signal(false);

  protected readonly isPhone = computed(() => this.channel() === 'phone');
  /** Saisie d'un numéro : soit pas de numéro au profil, soit « un autre numéro ». */
  protected readonly showCustomPhone = computed(
    () => !this.hasProfilePhone() || this.useOtherNumber(),
  );
  protected readonly resolvedPhone = computed(() =>
    this.hasProfilePhone() && !this.useOtherNumber()
      ? this.profilePhone()
      : this.customPhone().trim(),
  );

  protected readonly canSubmit = computed(() => {
    if (this.submitting() || this.placed()) {
      return false;
    }
    if (!this.isPhone()) {
      return true;
    }
    if (this.resolvedPhone() === '') {
      return false;
    }
    return this.asap() || this.scheduledDate() !== '';
  });

  protected onChannel(value: string): void {
    this.channel.set(value === 'email' ? 'email' : 'phone');
  }

  protected onSlot(value: string): void {
    this.slot.set(value === 'afternoon' ? 'afternoon' : 'morning');
  }

  /** Lit la valeur d'un `<input>` / `<textarea>` natif sans caster en `any`. */
  protected inputValue(event: Event): string {
    const el = event.target;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : '';
  }

  protected submit(): void {
    const data = this.data();
    if (!this.canSubmit() || data === undefined) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    const phone = this.isPhone();
    const payload: ActivationSupportPayload = {
      channel: this.channel(),
      phoneNumber: phone ? this.resolvedPhone() : '',
      asap: phone ? this.asap() : true,
      scheduledDate: phone && !this.asap() ? this.scheduledDate() : null,
      slot: phone && !this.asap() ? this.slot() : null,
      message: this.message().trim(),
    };
    this.support.requestActivation(data.companyId, payload).subscribe({
      next: () => {
        this.placed.set(true);
        this.submitting.set(false);
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set("L'envoi de la demande a échoué. Réessayez.");
      },
    });
  }

  protected close(): void {
    this.ref.close(this.placed());
  }
}
