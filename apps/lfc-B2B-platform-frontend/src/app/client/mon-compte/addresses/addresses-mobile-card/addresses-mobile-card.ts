import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { ClientAddresses } from '../../../client-addresses.service';
import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { AddressesPanel } from '../addresses-panel/addresses-panel';
import { type AddressesView, deliveryCountLabel, postalLine } from '../addresses-section';

/**
 * La carte **Adresses** en pile : la facturation en une ligne et le nombre de
 * livraisons, et DEUX boutons — « Facturation », « Livraison » —, chacun
 * ouvrant le panneau sur sa partie du carnet (demande de Hugo, 2026-09-14).
 * Les zones, les notes et l'ajout d'une adresse sont dans le panneau.
 */
@Component({
  selector: 'app-addresses-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFoot],
  templateUrl: './addresses-mobile-card.html',
  styleUrl: './addresses-mobile-card.scss',
})
export class AddressesMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly addresses = inject(ClientAddresses);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly billing = computed(() => {
    const billing = this.addresses.billing();
    return billing === null ? this.t().account.addressNone : postalLine(billing);
  });

  protected readonly deliveryCount = computed(() =>
    deliveryCountLabel(this.addresses.deliveries().length, this.t().account),
  );

  protected open(view: AddressesView): void {
    const company = this.client.company();
    if (company !== null) {
      AddressesPanel.open(this.panels, company, view, null);
    }
  }
}
