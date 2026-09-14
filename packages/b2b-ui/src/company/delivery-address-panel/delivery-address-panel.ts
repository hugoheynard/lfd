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
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

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
import { DeliveryAddressForm } from '../delivery-address-form/delivery-address-form';

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
 * Son corps est le formulaire partagé `lfd-delivery-address-form` (depuis le
 * 2026-09-14) : le dialogue client de `/mon-compte` compose le même, avec son
 * propre cadre, son écriture et sa langue. Ce panneau garde l'en-tête, le pied
 * et `ADDRESS_WRITER`. Le commercial règle un code d'accès ou un
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
    DeliveryAddressForm,
  ],
  templateUrl: './delivery-address-panel.html',
})
export class DeliveryAddressPanel {
  static readonly foldPanel = ADDRESS_PANEL_DEFAULTS;

  private readonly writer = inject(ADDRESS_WRITER);
  private readonly ref = inject(FoldPanelRef<boolean>);
  private readonly submitter = panelSubmit();

  readonly data = input.required<DeliveryAddressPanelData>();

  protected readonly draft = signal<DeliveryDraft>(EMPTY_DELIVERY_DRAFT);
  protected readonly pending = this.submitter.pending;

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
