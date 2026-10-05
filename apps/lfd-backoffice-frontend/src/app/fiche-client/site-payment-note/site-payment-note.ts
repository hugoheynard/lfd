import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldCalloutComponent } from 'fold-ng';

import type { ParentCompanyView } from '@lfd/contracts';

/**
 * **Le règlement d'un site**, en une ligne : le RIB et le mandat sont ceux du
 * principal, et la carte reste possible à la commande. La section Paiement
 * d'un client (RIB, mandat, crédits) n'a pas de sens ici.
 */
@Component({
  selector: 'app-site-payment-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldCalloutComponent],
  templateUrl: './site-payment-note.html',
})
export class SitePaymentNote {
  readonly parent = input.required<ParentCompanyView>();
}
