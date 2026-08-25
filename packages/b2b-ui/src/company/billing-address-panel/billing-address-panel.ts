import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { BillingAddressView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { AddressForm } from '../../address/address-form/address-form';
import { DEFAULT_POSTAL_FIELDS, type PostalAddress } from '../../address/address.model';
import { ADDRESS_PANEL_DEFAULTS } from '../address-panel.defaults';
import { ADDRESS_WRITER } from '../../panel/address-writer';
import {
  EMPTY_POSTAL_DRAFT,
  postalDraftFrom,
  postalIssue,
  toBillingPayload,
  toPostal,
  withPostal,
  type PostalDraft,
} from '../postal-draft.model';
import { panelSubmit } from '../../panel/panel-submit';

/** Charge d'ouverture : la société visée, et l'adresse à corriger le cas échéant. */
export interface BillingAddressPanelData {
  readonly companyId: string;
  /** `null` pour poser l'adresse ; la vue existante pour la corriger. */
  readonly address: BillingAddressView | null;
}

/**
 * Panneau **Adresse de facturation** — une par entreprise, purement postale.
 *
 * Le même panneau sert le client et le commercial : les champs, la validation
 * et les libellés sont identiques, et seul le chemin d'écriture change (cf.
 * `ADDRESS_WRITER`). Il **pose ou corrige** : sans le préremplissage, changer
 * un numéro de rue obligerait à retaper les six champs, et ce qu'on retape
 * sous la dictée, on le fausse.
 */
@Component({
  selector: 'lfd-billing-address-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    AddressForm,
  ],
  templateUrl: './billing-address-panel.html',
})
export class BillingAddressPanel {
  static readonly foldPanel = ADDRESS_PANEL_DEFAULTS;

  private readonly writer = inject(ADDRESS_WRITER);
  private readonly ref = inject(FoldPanelRef<boolean>);
  private readonly submitter = panelSubmit();

  readonly data = input.required<BillingAddressPanelData>();

  protected readonly fields = DEFAULT_POSTAL_FIELDS;
  protected readonly draft = signal<PostalDraft>(EMPTY_POSTAL_DRAFT);
  protected readonly pending = this.submitter.pending;

  protected readonly postal = computed(() => toPostal(this.draft()));
  protected readonly isCreate = computed(() => this.data().address === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Adresse de facturation' : 'Modifier l’adresse de facturation',
  );
  protected readonly canSubmit = computed(() => postalIssue(this.draft()) === '');

  constructor() {
    // Préremplit à l'ouverture ; `data` est fixé et ne change plus.
    effect(() => {
      const address = this.data().address;
      if (address !== null) {
        this.draft.set(postalDraftFrom(address));
      }
    });
  }

  protected setPostal(postal: PostalAddress): void {
    this.draft.update((draft) => withPostal(draft, postal));
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const { companyId } = this.data();
    void this.submitter.run(
      () => this.writer.saveBilling(companyId, toBillingPayload(this.draft())),
      'Adresse de facturation enregistrée.',
    );
  }

  protected cancel(): void {
    this.ref.close();
  }
}
