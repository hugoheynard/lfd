import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldCalloutComponent, FoldCheckboxComponent } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AdminDeliveryDepositService } from '../../../comptes-clients/admin-delivery-deposit.service';

/**
 * **« Dépôt autorisé sans personne »**, côté staff (`a-la-porte.md`,
 * AP-Q1, AP-D5) — la case du commercial, à côté de la procédure de l'adresse.
 *
 * Écrite dès qu'on la coche, par sa route à part, sous
 * `delivery_procedures:write` ; sans ce droit, elle se lit sans se régler.
 * Un refus du serveur s'affiche tel quel et la case revient à ce qui est
 * enregistré. Une signature exigée l'emporte toujours au départ (AP-Q6) :
 * l'écran le rappelle, il ne refait pas la règle.
 */
@Component({
  selector: 'app-delivery-deposit-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldCheckboxComponent],
  templateUrl: './delivery-deposit-toggle.html',
  styleUrl: './delivery-deposit-toggle.scss',
})
export class DeliveryDepositToggle {
  private readonly service = inject(AdminDeliveryDepositService);
  private readonly permissions = inject(PermissionsStore);

  readonly companyId = input.required<string>();
  readonly addressId = input.required<string>();
  /** Ce que l'adresse porte à l'ouverture. */
  readonly depositAllowed = input.required<boolean>();

  /** La valeur enregistrée a changé. */
  readonly changed = output<boolean>();

  protected readonly canEdit = computed(() => this.permissions.can('delivery_procedures:write'));
  protected readonly checked = signal(false);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  constructor() {
    effect(() => {
      const initial = this.depositAllowed();
      untracked(() => this.checked.set(initial));
    });
  }

  protected async toggle(value: boolean): Promise<void> {
    if (this.saving() || !this.canEdit()) {
      return;
    }
    const previous = this.checked();
    this.checked.set(value);
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.service.set(this.companyId(), this.addressId(), value);
      this.changed.emit(value);
    } catch (error) {
      this.checked.set(previous);
      this.refusal.set(httpErrorMessage(error, '« Dépôt autorisé » n’a pas pu être enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }
}
