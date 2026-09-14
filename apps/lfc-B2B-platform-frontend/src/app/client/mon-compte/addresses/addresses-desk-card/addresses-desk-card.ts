import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldBadgeComponent, FoldButtonComponent, FoldPanelHostService } from 'fold-ng';

import { ClientAddresses } from '../../../client-addresses.service';
import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { AddressesPanel } from '../addresses-panel/addresses-panel';
import {
  type AddressesForm,
  type AddressesView,
  canWriteAddresses,
  deliveryCountLabel,
  deliveryRows,
  postalLine,
} from '../addresses-section';

/**
 * La carte **Adresses** du bureau : UNE facturation et PLUSIEURS livraisons,
 * côte à côte — en rangée, on voit d'un coup la différence.
 *
 * 🔴 **Les adresses viennent de notre base** (`GET /companies/:id/addresses`),
 * les mêmes que le carnet du checkout : deux listes pour un même client
 * finiraient par ne pas dire la même chose.
 *
 * Ses gestes d'écriture — renseigner ou modifier la facturation, ajouter ou
 * modifier une livraison — ouvrent le panneau directement sur leur formulaire,
 * aux rôles qui écrivent.
 */
@Component({
  selector: 'app-addresses-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent],
  templateUrl: './addresses-desk-card.html',
  styleUrl: './addresses-desk-card.scss',
})
export class AddressesDeskCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly addresses = inject(ClientAddresses);
  private readonly service = inject(ServicePoints);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly canWrite = computed(() => canWriteAddresses(this.client.company()));

  protected readonly billing = computed(() => {
    const billing = this.addresses.billing();
    return billing === null ? null : postalLine(billing);
  });

  protected readonly deliveries = computed(() =>
    deliveryRows(
      this.addresses.deliveries(),
      (codePostal) => this.service.zoneFor(codePostal),
      this.t().account.addressNoZone,
    ),
  );

  protected readonly deliveryCount = computed(() =>
    deliveryCountLabel(this.deliveries().length, this.t().account),
  );

  /** Les gestes du bureau vont droit au formulaire de leur partie. */
  protected open(view: AddressesView, form: AddressesForm): void {
    const company = this.client.company();
    if (company !== null) {
      AddressesPanel.open(this.panels, company, view, form);
    }
  }
}
