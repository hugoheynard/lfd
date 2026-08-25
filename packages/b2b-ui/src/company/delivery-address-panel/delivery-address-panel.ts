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
import {
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { AddressForm } from '../../address/address-form/address-form';
import { ALL_POSTAL_FIELDS, type PostalAddress } from '../../address/address.model';
import { panelSubmit } from '../../panel/panel-submit';
import { ADDRESS_PANEL_DEFAULTS } from '../address-panel.defaults';
import { ADDRESS_WRITER } from '../../panel/address-writer';
import {
  deliveryDraftFrom,
  deliveryIssueOf,
  EMPTY_DELIVERY_DRAFT,
  toDeliveryPayload,
  type DeliveryDraft,
} from '../delivery-draft.model';
import { DeliverySpecs } from '../delivery-specs/delivery-specs';
import { toPostal, withPostal } from '../postal-draft.model';

/** Charge d'ouverture : la société visée, l'adresse à corriger, et son contexte. */
export interface DeliveryAddressPanelData {
  readonly companyId: string;
  /** `null` pour en créer une ; la vue existante pour la corriger. */
  readonly address: DeliveryAddressView | null;
  /** Contacts connus de l'entreprise, proposés pour préremplir le contact sur place. */
  readonly knownContacts: readonly DeliveryContact[];
  /**
   * Le socle de signature de la société. Il entre pour être MONTRÉ, et il est
   * **requis** : sans lui, « comme la société » ne dit pas ce qu'elle vaut, et
   * on choisit au hasard. Facultatif, il se serait oublié — et il l'était.
   */
  readonly signatureFloor: boolean;
}

/**
 * Panneau **Adresse de livraison** — plusieurs par entreprise, une par défaut,
 * postal plus les consignes de LFC.
 *
 * Le même panneau sert le client et le commercial : seul le chemin d'écriture
 * change (cf. `ADDRESS_WRITER`). Le commercial règle un code d'accès ou un
 * créneau dicté au téléphone ; renvoyer le client sur son écran reviendrait à
 * attendre une livraison ratée pour que ça bouge.
 */
@Component({
  selector: 'lfd-delivery-address-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldCheckboxComponent,
    AddressForm,
    DeliverySpecs,
  ],
  templateUrl: './delivery-address-panel.html',
})
export class DeliveryAddressPanel {
  static readonly foldPanel = ADDRESS_PANEL_DEFAULTS;

  private readonly writer = inject(ADDRESS_WRITER);
  private readonly ref = inject(FoldPanelRef<boolean>);
  private readonly submitter = panelSubmit();

  readonly data = input.required<DeliveryAddressPanelData>();

  /** Le point GPS et la note ne se demandent qu'ici : c'est le livreur qui cherche l'entrée. */
  protected readonly fields = ALL_POSTAL_FIELDS;
  protected readonly draft = signal<DeliveryDraft>(EMPTY_DELIVERY_DRAFT);
  protected readonly pending = this.submitter.pending;

  protected readonly postal = computed(() => toPostal(this.draft()));
  protected readonly isCreate = computed(() => this.data().address === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle adresse de livraison' : 'Modifier l’adresse de livraison',
  );
  protected readonly canSubmit = computed(() => deliveryIssueOf(this.draft()) === '');

  constructor() {
    // Préremplit à l'ouverture ; `data` est fixé et ne change plus.
    effect(() => {
      const address = this.data().address;
      if (address !== null) {
        this.draft.set(deliveryDraftFrom(address));
      }
    });
  }

  protected setPostal(postal: PostalAddress): void {
    this.draft.update((draft) => withPostal(draft, postal));
  }

  protected setDefault(isDefault: boolean): void {
    this.draft.update((draft) => ({ ...draft, isDefault }));
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const { companyId, address } = this.data();
    const payload = toDeliveryPayload(this.draft());
    void this.submitter.run(
      () =>
        address === null
          ? this.writer.addDelivery(companyId, payload)
          : this.writer.updateDelivery(companyId, address.id, payload),
      address === null ? 'Adresse de livraison ajoutée.' : 'Adresse de livraison mise à jour.',
    );
  }

  protected cancel(): void {
    this.ref.close();
  }
}
