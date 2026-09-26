import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { LOYALTY_REASON_MAX, type LoyaltyVoucherView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';

import { formatCents } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';

import { formatPoints, holderName } from '../../loyalty-format';
import { LoyaltyService } from '../../loyalty.service';

/**
 * **Annuler un bon disponible, en disant pourquoi** (plan D7). Le bon passe à
 * `cancelled`, et une ligne `adjusted` liée au bon recrédite ses points au
 * titulaire — c'est le serveur qui l'écrit, l'écran l'annonce.
 *
 * Le motif est obligatoire et borné ; l'écran n'envoie pas ce que le serveur
 * refuserait. Un refus (le bon n'est plus disponible) reste dans le panneau,
 * mot pour mot. Un succès ferme sur `true`, et l'appelant relit la liste.
 */
@Component({
  selector: 'app-cancel-voucher-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './cancel-voucher-panel.html',
  styleUrl: './cancel-voucher-panel.scss',
})
export class CancelVoucherPanel {
  private readonly api = inject(LoyaltyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<LoyaltyVoucherView | undefined>(undefined);

  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly maxLength = LOYALTY_REASON_MAX;

  protected readonly subtitle = computed(() => {
    const voucher = this.data();
    return voucher === undefined
      ? ''
      : `${formatCents(voucher.valueCents)} — ${holderName(voucher.holder)}`;
  });

  protected readonly refunded = computed(() => formatPoints(this.data()?.pointsCost ?? 0));

  private readonly trimmed = computed(() => this.reason().trim());
  protected readonly tooLong = computed(() => this.trimmed().length > LOYALTY_REASON_MAX);

  protected readonly canSubmit = computed(
    () => this.trimmed() !== '' && !this.tooLong() && !this.saving(),
  );

  protected async submit(): Promise<void> {
    const voucher = this.data();
    if (voucher === undefined || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.cancelVoucher(voucher.id, this.trimmed());
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le bon n'a pas pu être annulé."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
