import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { PaymentPanel } from '../payment-panel/payment-panel';
import { monthlyTermState, monthlyTermView } from '../payment-section';

/**
 * La carte **Paiement** en pile : le régime ouvert à tous, et le crédit avec
 * son état — accordé, en attente, non accordé. La phrase qui dit qu'il n'y a
 * pas de troisième régime, et la demande, sont dans le panneau.
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
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly monthly = computed(() =>
    monthlyTermView(monthlyTermState(this.client.company()), this.t().account),
  );

  protected open(): void {
    const company = this.client.company();
    if (company !== null) {
      PaymentPanel.open(this.panels, company);
    }
  }
}
