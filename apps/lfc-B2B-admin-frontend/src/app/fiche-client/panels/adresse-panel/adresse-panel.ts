import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import type { DeliveryContact } from '@lfd/contracts';
import { FoldButtonComponent, FoldPanelHeaderComponent, FoldPanelRef } from 'fold-ng';
import {
  AddressFields,
  EMPTY_ADDRESS_DRAFT,
  isAddressValid,
  toBillingPayload,
  toDeliveryPayload,
  type AddressDraft,
} from '@lfd/b2b-ui/company';

import { NotifyService } from '../../../notify.service';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';

/** Charge d'ouverture : la société visée + le type d'adresse à créer (Porte B). */
export interface AdminAdressePanelData {
  readonly companyId: string;
  readonly kind: 'facturation' | 'livraison';
  readonly knownContacts?: readonly DeliveryContact[];
}

/**
 * Panneau **Adresse** côté **staff** — le commercial renseigne une adresse de
 * facturation ou de livraison à la place du client (Porte B). Container mince sur
 * le fragment partagé `lfd-address-fields` : seule la sauvegarde diffère du client
 * (service admin, sans mur). Création uniquement — l'édition fine reste au client.
 */
@Component({
  selector: 'app-admin-adresse-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, AddressFields],
  templateUrl: './adresse-panel.html',
  styleUrl: './adresse-panel.scss',
})
export class AdminAdressePanel {
  private readonly service = inject(AdminCompaniesService);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input.required<AdminAdressePanelData>();

  protected readonly draft = signal<AddressDraft>(EMPTY_ADDRESS_DRAFT);
  protected readonly submitting = signal(false);

  protected readonly kind = computed(() => this.data().kind);
  protected readonly knownContacts = computed<readonly DeliveryContact[]>(
    () => this.data().knownContacts ?? [],
  );
  protected readonly heading = computed(() =>
    this.kind() === 'facturation' ? 'Adresse de facturation' : 'Nouvelle adresse de livraison',
  );
  protected readonly canSubmit = computed(() => isAddressValid(this.draft(), this.kind()));

  protected async submit(): Promise<void> {
    const data = this.data();
    if (!this.canSubmit() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      if (data.kind === 'facturation') {
        await this.service.saveBilling(data.companyId, toBillingPayload(this.draft()));
        this.notify.success('Adresse de facturation enregistrée.');
      } else {
        await this.service.addDelivery(data.companyId, toDeliveryPayload(this.draft()));
        this.notify.success('Adresse de livraison ajoutée.');
      }
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.submitting.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
