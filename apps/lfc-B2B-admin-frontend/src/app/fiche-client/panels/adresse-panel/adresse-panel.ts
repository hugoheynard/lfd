import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import type { DeliveryAddressView, DeliveryContact } from '@lfd/contracts';
import { FoldButtonComponent, FoldPanelHeaderComponent, FoldPanelRef } from 'fold-ng';
import {
  AddressFields,
  deliveryDraftFrom,
  EMPTY_ADDRESS_DRAFT,
  isAddressValid,
  toBillingPayload,
  toDeliveryPayload,
  type AddressDraft,
} from '@lfd/b2b-ui/company';

import { NotifyService } from '../../../notify.service';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';

/** Charge d'ouverture : la société visée + le type d'adresse (Porte B). */
export interface AdminAdressePanelData {
  readonly companyId: string;
  readonly kind: 'facturation' | 'livraison';
  readonly knownContacts?: readonly DeliveryContact[];
  /**
   * L'adresse de livraison à **corriger** ; absente, on en crée une.
   *
   * Une seule charge pour les deux gestes : les champs sont les mêmes, et un
   * second panneau jumeau divergerait du premier au premier champ ajouté d'un
   * seul côté.
   */
  readonly delivery?: DeliveryAddressView;
}

/**
 * Panneau **Adresse** côté **staff** — le commercial renseigne une adresse de
 * facturation ou de livraison à la place du client (Porte B). Container mince sur
 * le fragment partagé `lfd-address-fields` : seule la sauvegarde diffère du client
 * (service admin, sans mur). Il **crée ou corrige** : le commercial règle un
 * code d'accès ou un créneau au téléphone, et le renvoyer au client reviendrait
 * à attendre une livraison ratée pour que ça bouge.
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
  /** L'adresse en cours de correction, ou `undefined` en création. */
  private readonly editing = computed(() => this.data().delivery);

  protected readonly heading = computed(() => {
    if (this.kind() === 'facturation') {
      return 'Adresse de facturation';
    }
    return this.editing() === undefined
      ? 'Nouvelle adresse de livraison'
      : 'Modifier l’adresse de livraison';
  });
  protected readonly canSubmit = computed(() => isAddressValid(this.draft(), this.kind()));

  constructor() {
    // Préremplir depuis l'adresse à corriger : un formulaire vide obligerait à
    // tout retaper pour changer un code d'accès, et ce qui se retape se perd.
    effect(() => {
      const existing = this.editing();
      if (existing !== undefined) {
        this.draft.set(deliveryDraftFrom(existing));
      }
    });
  }

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
      } else if (data.delivery === undefined) {
        await this.service.addDelivery(data.companyId, toDeliveryPayload(this.draft()));
        this.notify.success('Adresse de livraison ajoutée.');
      } else {
        await this.service.updateDelivery(
          data.companyId,
          data.delivery.id,
          toDeliveryPayload(this.draft()),
        );
        this.notify.success('Adresse de livraison mise à jour.');
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
