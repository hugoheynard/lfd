import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldCalloutComponent } from 'fold-ng';

import type { ParentCompanyView } from '@lfd/contracts';

/**
 * **Le règlement d'un site**, en une ligne : le RIB, le mandat et le crédit
 * sont ceux du principal, et la carte reste possible à la commande. La
 * section Paiement d'un client (RIB, mandat, crédits) n'a pas de sens ici.
 *
 * `settlesOnAccount` est le crédit du PAYEUR (`payerSettlesOnAccount`), celui
 * que la passation lit : la note dit si « au compte » est ouvert au site sans
 * qu'on ait à ouvrir la fiche du principal.
 */
@Component({
  selector: 'app-site-payment-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldCalloutComponent],
  templateUrl: './site-payment-note.html',
})
export class SitePaymentNote {
  readonly parent = input.required<ParentCompanyView>();
  readonly settlesOnAccount = input.required<boolean>();
}
