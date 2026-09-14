import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldBadgeComponent } from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';

/**
 * La carte **Paiement** du bureau : DEUX RÉGIMES ET PAS PLUS, côte à côte —
 * l'absence de crédit ne doit pas ressembler à un refus. Le badge dit lequel
 * est CONVENU ; rien ne s'y écrit, un régime se convient avec le commercial.
 *
 * 🔴 Les tuiles SEPA et carte de la maquette sont parties : « IBAN •••• 3041 »
 * et « Visa •••• 4242 » étaient écrits en dur, et un moyen de paiement
 * d'exemple est celui de quelqu'un d'autre.
 */
@Component({
  selector: 'app-payment-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './payment-desk-card.html',
  styleUrl: './payment-desk-card.scss',
})
export class PaymentDeskCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly client = inject(ClientCompany);
}
