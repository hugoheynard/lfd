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
import {
  DeliveryAddressForm,
  deliveryDraftFrom,
  deliveryIssueOf,
  EMPTY_DELIVERY_DRAFT,
  toDeliveryPayload,
  type DeliveryDraft,
} from '@lfd/b2b-ui/company';
import type { CompanyView, DeliveryAddressView, DeliveryContact } from '@lfd/contracts';
import {
  FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
  FOLD_INLINE_CONFIRM_LABELS,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDangerZoneComponent,
  type FoldInlineConfirmLabels,
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
import { knownDeliveryContacts } from '../addresses-section';

/** Charge d'ouverture — la même que `DeliveryAddressPanelData` du back-office, plus le rang. */
export interface DeliveryAddressDialogData {
  readonly companyId: string;
  /** `null` pour en créer une ; la vue existante pour la corriger. */
  readonly address: DeliveryAddressView | null;
  /** Le contact principal s'il a un nom, proposé pour préremplir le contact sur place. */
  readonly knownContacts: readonly DeliveryContact[];
  /** Le socle de signature de la société, montré dans l'option « comme la société ». */
  readonly signatureFloor: boolean;
  /** Le carnet est vide : la première adresse est cochée « par défaut » d'office. */
  readonly firstOfBook: boolean;
}

/**
 * Les mots de la confirmation de la zone de danger : `fold-danger-zone` n'a pas
 * d'entrée de libellés (fold-ng 0.27.2, vérifié le 2026-09-14), et fold parle
 * anglais par défaut.
 */
function removeConfirmLabels(): FoldInlineConfirmLabels {
  const copy = inject(ClientCopyService).t().account;
  return {
    ...FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
    confirm: copy.addressRemoveConfirm,
    cancel: copy.cancel,
    cancelAria: copy.cancel,
    busy: copy.addressRemoveBusy,
    group: copy.addressRemoveGroup,
  };
}

/**
 * Le **dialogue d'une adresse de livraison** de `/mon-compte` — l'ajouter ou la
 * corriger, consignes comprises.
 *
 * ## Le même formulaire que le back-office
 *
 * Son corps est `lfd-delivery-address-form` de `@lfd/b2b-ui/company`, celui du
 * `DeliveryAddressPanel` du commercial : la case « par défaut », le postal avec
 * note et point GPS, les créneaux, le contact sur place et la signature. La
 * parité de champs tient par construction, pas par recopie.
 *
 * Ce dialogue n'ajoute que son cadre : l'écriture par `ClientAddresses` (le
 * panneau admin écrit par `ADDRESS_WRITER` et toaste en français) et les mots
 * de l'écran (`account.deliveryForm`, fr/en/it).
 *
 * ## Dialogue au bureau, feuille en pile
 *
 * Une adresse se saisit d'un bloc : au bureau, elle interrompt la page
 * ({@link dialogSide}) ; sur un téléphone, elle monte du bas.
 *
 * ## Enregistrer, supprimer
 *
 * « Enregistrer » ne s'arme qu'une fois la charge différente de celle
 * d'ouverture (règle « Saisir »). En correction, la **zone de danger** archive
 * l'adresse : si c'était la défaut, le serveur en promeut une autre, et le
 * carnet relu le montre. Un refus reste affiché dans le dialogue ouvert ; un
 * succès toaste et ferme avec `true`.
 */
@Component({
  selector: 'app-delivery-address-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DeliveryAddressForm,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDangerZoneComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  providers: [{ provide: FOLD_INLINE_CONFIRM_LABELS, useFactory: removeConfirmLabels }],
  templateUrl: './delivery-address-dialog.html',
  styleUrl: './delivery-address-dialog.scss',
})
export class DeliveryAddressDialog {
  /**
   * `lg` (640 px) : sept lignes de créneaux — un nom de jour et deux heures —
   * et le prénom à côté du nom tiennent sans se replier ; `md` (490) les
   * pliait (échelle `FoldPanelSize`, vérifiée dans fold-ng 0.27.2).
   */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'lg', surface: 'solid' };

  /**
   * Ouvre le dialogue sur la société telle que `/me` la porte.
   *
   * `stack` : ouvert depuis le panneau des adresses, il s'empile par-dessus au
   * lieu de le fermer — fold ferme les panneaux ouverts par défaut, et la liste
   * doit être là au retour.
   */
  static open(
    panels: FoldPanelHostService,
    company: CompanyView,
    address: DeliveryAddressView | null,
    firstOfBook: boolean,
    stack = false,
  ): FoldPanelRef<boolean> {
    return panels.open<DeliveryAddressDialogData, boolean>(DeliveryAddressDialog, {
      side: dialogSide(),
      stack,
      data: {
        companyId: company.id,
        address,
        knownContacts: knownDeliveryContacts(company),
        signatureFloor: company.fulfillmentPreference.signatureRequired,
        firstOfBook,
      },
    });
  }

  readonly data = input.required<DeliveryAddressDialogData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly addresses = inject(ClientAddresses);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly draft = signal<DeliveryDraft>(EMPTY_DELIVERY_DRAFT);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly removing = signal(false);
  /** Le message du dernier refus de suppression, `null` tant qu'il n'y en a pas. */
  protected readonly removeRefusal = signal<string | null>(null);

  protected readonly isCreate = computed(() => this.data().address === null);

  protected readonly heading = computed(() =>
    this.isCreate() ? this.t().account.addressAdd : this.t().account.addressEdit,
  );

  /** L'état d'ouverture : l'adresse corrigée, ou un brouillon vide rangé selon le carnet. */
  private readonly initial = computed<DeliveryDraft>(() => {
    const { address, firstOfBook } = this.data();
    return address === null
      ? { ...EMPTY_DELIVERY_DRAFT, isDefault: firstOfBook }
      : deliveryDraftFrom(address);
  });

  /** Quelque chose a-t-il changé ? Comparé sur la charge envoyée, rognée. */
  private readonly changed = computed(
    () =>
      JSON.stringify(toDeliveryPayload(this.draft())) !==
      JSON.stringify(toDeliveryPayload(this.initial())),
  );

  /** Enregistrer attend une modification ET un formulaire complet (règle « Saisir »). */
  protected readonly canSubmit = computed(
    () => !this.saving() && this.changed() && deliveryIssueOf(this.draft()) === '',
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const initial = this.initial();
      untracked(() => this.draft.set(initial));
    });
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    const { companyId, address } = this.data();
    const payload = toDeliveryPayload(this.draft());
    this.saving.set(true);
    this.refusal.set(null);
    const refusal =
      address === null
        ? await this.addresses.addDelivery(companyId, payload)
        : await this.addresses.updateDelivery(companyId, address.id, payload);
    this.saving.set(false);
    if (refusal === null) {
      this.notify.success(this.t().account.addressSavedToast);
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  /**
   * Archive l'adresse confirmée dans la zone de danger. L'écriture relit le
   * carnet : une défaut promue par le serveur y apparaît d'elle-même.
   */
  protected async remove(): Promise<void> {
    const { companyId, address } = this.data();
    if (address === null || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.removeRefusal.set(null);
    const refusal = await this.addresses.removeDelivery(companyId, address.id);
    this.removing.set(false);
    if (refusal === null) {
      this.notify.success(this.t().account.addressRemovedToast);
      this.ref.close(true);
    } else {
      this.removeRefusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
