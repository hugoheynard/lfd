import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { orderCancelCopy } from '../../copy/screens/order-cancel.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { dialogSide } from '../../panel-side';
import { CancelOrderForm } from '../cancel-order-form/cancel-order-form';
import { type CancellableState, type CancelReason, outcomeSentence } from '../cancellation-wording';
import { OrderCancellationGateway } from '../order-cancellation.gateway';

/** La commande visée : l'identifiant pour l'API, la référence pour l'écran. */
export interface CancelOrderDialogData {
  readonly orderId: string;
  readonly reference: string;
  readonly state: CancellableState;
}

/**
 * **« Annuler la commande »**, depuis « Mes commandes » (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.8).
 *
 * Un dialogue fold par {@link dialogSide} : l'en-tête, et la confirmation
 * commune. Un refus reste dans le dialogue ; un succès annonce et ferme sur
 * `true`, et c'est l'hôte qui relit la commande.
 */
@Component({
  selector: 'app-cancel-order-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CancelOrderForm, FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './cancel-order-dialog.html',
})
export class CancelOrderDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /** Ouvre la confirmation. Rend `true` si la commande est annulée, `undefined` sinon. */
  static open(
    panels: FoldPanelHostService,
    data: CancelOrderDialogData,
  ): FoldPanelRef<boolean | undefined> {
    return panels.open<CancelOrderDialogData, boolean | undefined>(CancelOrderDialog, {
      side: dialogSide(),
      data,
    });
  }

  readonly data = input.required<CancelOrderDialogData>();

  private readonly ref = inject(FoldPanelRef);
  private readonly gateway = inject(OrderCancellationGateway);
  private readonly notify = inject(NotifyService);
  private readonly locale = inject(ClientLocale).current;

  protected readonly c = screenCopy('orderCancel', orderCancelCopy);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected subtitle(): string {
    return fill(this.c().subtitle, { reference: this.data().reference });
  }

  protected async confirm(reason: CancelReason): Promise<void> {
    this.busy.set(true);
    this.refusal.set(null);
    const outcome = await this.gateway.cancel(this.data().orderId, reason);
    this.busy.set(false);
    switch (outcome.kind) {
      case 'done':
        this.notify.success(this.c().done);
        this.ref.close(true);
        return;
      case 'not_found':
        // Hors mur : le serveur rend `404`, jamais `403` (C6.2).
        this.refusal.set(this.c().refusals.not_allowed);
        return;
      case 'refused':
        this.refusal.set(
          outcomeSentence(outcome, this.data().state.until, this.locale(), this.c()),
        );
        return;
    }
  }

  protected keep(): void {
    this.ref.close(undefined);
  }
}
