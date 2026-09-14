import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldBadgeComponent, FoldButtonComponent, FoldPanelHostService } from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { PaymentPanel } from '../payment-panel/payment-panel';
import { canRequestMonthly, monthlyTermState, monthlyTermView } from '../payment-section';

/**
 * La carte **Paiement** du bureau : DEUX RÉGIMES ET PAS PLUS, côte à côte —
 * l'absence de crédit ne doit pas ressembler à un refus. La pastille du crédit
 * dit ce que `/me` en dit : accordé, demandé, ou ni l'un ni l'autre ; et,
 * dans ce dernier cas, « Demander » ouvre le panneau aux rôles qui écrivent.
 *
 * 🔴 Les tuiles SEPA et carte de la maquette sont parties : « IBAN •••• 3041 »
 * et « Visa •••• 4242 » étaient écrits en dur, et un moyen de paiement
 * d'exemple est celui de quelqu'un d'autre. « Accordé le 14/02/2024 · plafond
 * 2 000 € » les a suivis le 2026-09-14, pour la même raison.
 */
@Component({
  selector: 'app-payment-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent],
  templateUrl: './payment-desk-card.html',
  styleUrl: './payment-desk-card.scss',
})
export class PaymentDeskCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly monthly = computed(() =>
    monthlyTermView(monthlyTermState(this.client.company()), this.t().account),
  );

  protected readonly canRequest = computed(() => canRequestMonthly(this.client.company()));

  protected open(): void {
    const company = this.client.company();
    if (company !== null) {
      PaymentPanel.open(this.panels, company);
    }
  }
}
