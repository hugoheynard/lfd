import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { AddressForm, DEFAULT_POSTAL_FIELDS, type PostalAddress } from '@lfd/b2b-ui/address';
import {
  EMPTY_POSTAL_DRAFT,
  postalDraftFrom,
  postalIssue,
  toBillingPayload,
  toPostal,
  withPostal,
  type PostalDraft,
} from '@lfd/b2b-ui/company';
import type { BillingAddressView, CompanyView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { dialogSide } from '../../../panel-side';

/** Charge d'ouverture : la société, et la facturation actuelle — `null` si rien n'est posé. */
export interface BillingAddressDialogData {
  readonly companyId: string;
  readonly billing: BillingAddressView | null;
}

/**
 * Le **dialogue de l'adresse de facturation** de `/mon-compte` — la renseigner
 * ou la corriger.
 *
 * Le pendant de `DeliveryAddressDialog`, en plus court : les champs postaux par
 * défaut d'`lfd-address-form`, **ni note ni point GPS** — une facture ne se
 * livre pas. La logique est celle du paquet (`postalDraftFrom`, `postalIssue`,
 * `toBillingPayload`), la même que le `billing-address-panel` du back-office.
 *
 * Centré au bureau, feuille du bas en pile ({@link dialogSide}). Un refus reste
 * affiché dans le dialogue ouvert ; un succès toaste et ferme avec `true` — le
 * carnet est déjà relu par l'écriture (`ClientAddresses`).
 */
@Component({
  selector: 'app-billing-address-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressForm,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './billing-address-dialog.html',
  styleUrl: './billing-address-dialog.scss',
})
export class BillingAddressDialog {
  /** `md` (490 px) : des champs postaux seuls, sans créneaux à loger (échelle `FoldPanelSize`). */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /**
   * Ouvre le dialogue sur la facturation connue. `stack` : depuis le panneau
   * des adresses, il s'empile par-dessus au lieu de le fermer.
   */
  static open(
    panels: FoldPanelHostService,
    company: CompanyView,
    billing: BillingAddressView | null,
    stack = false,
  ): FoldPanelRef<boolean> {
    return panels.open<BillingAddressDialogData, boolean>(BillingAddressDialog, {
      side: dialogSide(),
      stack,
      data: { companyId: company.id, billing },
    });
  }

  readonly data = input.required<BillingAddressDialogData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly addresses = inject(ClientAddresses);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef);

  /** Une facture ne se livre pas : ni note, ni point GPS. */
  protected readonly fields = DEFAULT_POSTAL_FIELDS;
  protected readonly draft = signal<PostalDraft>(EMPTY_POSTAL_DRAFT);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly postal = computed(() => toPostal(this.draft()));

  protected readonly heading = computed(() =>
    this.data().billing === null ? this.t().account.billingFill : this.t().account.billingEdit,
  );

  protected readonly canSubmit = computed(() => !this.saving() && postalIssue(this.draft()) === '');

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const { billing } = this.data();
      untracked(() =>
        this.draft.set(billing === null ? EMPTY_POSTAL_DRAFT : postalDraftFrom(billing)),
      );
    });
  }

  protected setPostal(postal: PostalAddress): void {
    this.draft.update((draft) => withPostal(draft, postal));
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.addresses.saveBilling(
      this.data().companyId,
      toBillingPayload(this.draft()),
    );
    this.saving.set(false);
    if (refusal === null) {
      this.notify.success(this.t().account.addressSavedToast);
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
