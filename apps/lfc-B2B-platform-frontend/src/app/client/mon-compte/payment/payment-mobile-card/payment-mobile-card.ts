import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { PaymentPanel } from '../payment-panel/payment-panel';

/**
 * La carte **Paiement** en pile : les régimes CONVENUS, en une ligne chacun.
 * La phrase qui dit qu'il n'y en a pas de troisième est dans le panneau.
 */
@Component({
  selector: 'app-payment-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFoot],
  templateUrl: './payment-mobile-card.html',
  styleUrl: './payment-mobile-card.scss',
})
export class PaymentMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected open(): void {
    PaymentPanel.open(this.panels, this.client.hasDeferredTerm());
  }
}
