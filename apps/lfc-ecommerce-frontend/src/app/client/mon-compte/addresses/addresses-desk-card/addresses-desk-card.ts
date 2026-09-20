import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldBadgeComponent, FoldButtonComponent, FoldPanelHostService } from 'fold-ng';

import { CompletionCallout } from '../../completion/completion-callout/completion-callout';
import type { CompletionItem, CompletionTarget } from '../../completion/completion-items';
import { ClientAddresses } from '../../../client-addresses.service';
import { ClientCompany } from '../../../client-company.service';
import { ClientLocale } from '../../../client-locale.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { deliveryProcedureCopy } from '../../../copy/screens/delivery-procedure.copy';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { BillingAddressDialog } from '../billing-address-dialog/billing-address-dialog';
import {
  canWriteAddresses,
  deliveryCountLabel,
  deliveryRows,
  postalLine,
  procedureEntryLabel,
} from '../addresses-section';
import { DeliveryAddressDialog } from '../delivery-address-dialog/delivery-address-dialog';
import { DeliveryProcedureDialog } from '../delivery-procedure-dialog/delivery-procedure-dialog';

/**
 * La carte **Adresses** du bureau : UNE facturation et PLUSIEURS livraisons,
 * côte à côte — en rangée, on voit d'un coup la différence.
 *
 * 🔴 **Les adresses viennent de notre base** (`GET /companies/:id/addresses`),
 * les mêmes que le carnet du checkout : deux listes pour un même client
 * finiraient par ne pas dire la même chose.
 *
 * Ses gestes d'écriture, aux rôles qui écrivent, ouvrent chacun leur DIALOGUE :
 * la facturation (`BillingAddressDialog`), une livraison consignes comprises
 * (`DeliveryAddressDialog`).
 *
 * Chaque livraison porte aussi l'entrée de sa **procédure de livraison**, à
 * TOUS les membres : son dialogue est en lecture seule pour qui ne gère pas.
 */
@Component({
  selector: 'app-addresses-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompletionCallout, FoldBadgeComponent, FoldButtonComponent],
  templateUrl: './addresses-desk-card.html',
  styleUrl: './addresses-desk-card.scss',
})
export class AddressesDeskCard {
  /** Ce qui manque dans cette carte (plan `plan-mon-compte-a-completer.md` §2.3) — la page le calcule. */
  readonly completion = input<readonly CompletionItem[]>([]);
  /** Compléter un élément : la page ouvre le dialogue de sa cible, le même que la synthèse du haut. */
  readonly completionAction = output<CompletionTarget>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);
  private readonly procedureCopy = computed(() => deliveryProcedureCopy(this.locale.current()));
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
    ).map((row) => ({
      ...row,
      procedure: procedureEntryLabel(row.procedureStepCount, this.canWrite(), this.procedureCopy()),
    })),
  );

  protected readonly deliveryCount = computed(() =>
    deliveryCountLabel(this.deliveries().length, this.t().account),
  );

  /** Renseigner ou modifier la facturation : son dialogue. */
  protected editBilling(): void {
    const company = this.client.company();
    if (company !== null) {
      BillingAddressDialog.open(this.panels, company, this.addresses.billing());
    }
  }

  /** La procédure de livraison d'une adresse : son dialogue, lecture seule selon le rôle. */
  protected openProcedure(addressId: string): void {
    const company = this.client.company();
    const address = this.addresses.deliveries().find((a) => a.id === addressId);
    if (company !== null && address !== undefined) {
      DeliveryProcedureDialog.open(this.panels, company, address);
    }
  }

  /** Ajouter (`null`) ou corriger une livraison : son dialogue. */
  protected openDelivery(addressId: string | null): void {
    const company = this.client.company();
    if (company === null) {
      return;
    }
    const book = this.addresses.deliveries();
    const address = addressId === null ? null : (book.find((a) => a.id === addressId) ?? null);
    if (addressId !== null && address === null) {
      return;
    }
    DeliveryAddressDialog.open(this.panels, company, address, book.length === 0);
  }
}
