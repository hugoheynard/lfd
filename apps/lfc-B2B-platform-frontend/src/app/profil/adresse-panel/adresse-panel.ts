import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import type { BillingAddressView, DeliveryAddressView, DeliveryContact } from '@lfd/contracts';
import { FoldButtonComponent, FoldPanelHeaderComponent, FoldPanelRef } from 'fold-ng';
import {
  AddressFields,
  billingDraftFrom,
  deliveryDraftFrom,
  EMPTY_ADDRESS_DRAFT,
  isAddressValid,
  toBillingPayload,
  toDeliveryPayload,
  type AddressDraft,
} from '@lfd/b2b-ui/company';

import { AddressesService } from '../../entreprises/addresses.service';

/**
 * Charge d'ouverture du panneau. Union **discriminée** par `kind`, toujours
 * porteuse du `companyId` (mur). Une facturation crée (`null`) ou édite une
 * `BillingAddressView` ; une livraison crée/édite une `DeliveryAddressView` et
 * reçoit les contacts connus de l'entreprise pour préremplir le contact sur place.
 */
export type AdressePanelData =
  | {
      readonly companyId: string;
      readonly kind: 'billing';
      readonly address: BillingAddressView | null;
    }
  | {
      readonly companyId: string;
      readonly kind: 'delivery';
      readonly address: DeliveryAddressView | null;
      readonly knownContacts: readonly DeliveryContact[];
    };

/**
 * Panneau **Adresse** — crée ou édite une adresse de facturation (unique) ou de
 * livraison (plusieurs, une par défaut), sur la vraie API par entreprise.
 *
 * Container **mince** : il seede un brouillon depuis `data`, délègue toute la
 * saisie au fragment partagé `lfd-address-fields` (@lfd/b2b-ui), et enchaîne la
 * sauvegarde. La forme du brouillon, la validation et le mapping vers les charges
 * vivent dans le modèle partagé — client et admin en partagent la moitié saisie.
 */
@Component({
  selector: 'app-adresse-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, AddressFields],
  templateUrl: './adresse-panel.html',
  styleUrl: './adresse-panel.scss',
})
export class AdressePanel {
  private readonly addresses = inject(AddressesService);
  private readonly ref = inject(FoldPanelRef);

  readonly data = input<AdressePanelData | undefined>(undefined);

  protected readonly draft = signal<AddressDraft>(EMPTY_ADDRESS_DRAFT);

  protected readonly kind = computed(() => this.data()?.kind ?? 'delivery');
  protected readonly isCreate = computed(() => (this.data()?.address ?? null) === null);
  protected readonly knownContacts = computed<readonly DeliveryContact[]>(() => {
    const data = this.data();
    return data?.kind === 'delivery' ? data.knownContacts : [];
  });

  constructor() {
    // Préremplit le brouillon à l'ouverture. `data` est fixé et ne change plus.
    effect(() => {
      const data = this.data();
      if (data === undefined || data.address === null) {
        return;
      }
      this.draft.set(
        data.kind === 'billing' ? billingDraftFrom(data.address) : deliveryDraftFrom(data.address),
      );
    });
  }

  protected readonly heading = computed(() => {
    if (this.kind() === 'billing') {
      return 'Adresse de facturation';
    }
    return this.isCreate() ? 'Nouvelle adresse de livraison' : "Modifier l'adresse de livraison";
  });

  protected readonly canSubmit = computed(() => isAddressValid(this.draft(), this.kind()));

  protected submit(): void {
    const data = this.data();
    if (!this.canSubmit() || data === undefined) {
      return;
    }
    const close = (): void => this.ref.close(true);
    if (data.kind === 'billing') {
      this.addresses.saveBilling(data.companyId, toBillingPayload(this.draft()), close);
      return;
    }
    const payload = toDeliveryPayload(this.draft());
    if (data.address === null) {
      this.addresses.addDelivery(data.companyId, payload, close);
    } else {
      this.addresses.updateDelivery(data.companyId, data.address.id, payload, close);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
