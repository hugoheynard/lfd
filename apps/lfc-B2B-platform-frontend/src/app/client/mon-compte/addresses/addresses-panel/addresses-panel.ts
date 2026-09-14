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
import type { CompanyView, DeliveryAddressView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  type FoldInlineConfirmLabels,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { ServicePoints } from '../../../shop/pickup-points.store';
import {
  type AddressesForm,
  type AddressesView,
  canWriteAddresses,
  deliveryCountLabel,
  deliveryRows,
  postalLine,
} from '../addresses-section';
import { DeliveryAddressDialog } from '../delivery-address-dialog/delivery-address-dialog';

/** Ce que montre le panneau : la partie du carnet, ou le formulaire de la facturation. */
type AddressesMode = 'list' | 'form';

/** Une action de ligne en vol : sur quelle livraison, et laquelle des deux. */
interface RowAction {
  readonly addressId: string;
  readonly kind: 'remove' | 'default';
}

/** Charge d'ouverture : la société, et si l'on peut écrire son carnet. */
export interface AddressesPanelData {
  readonly companyId: string;
  /** `owner`/`admin` : ceux que l'API laisse écrire (`ensureCompanyAdmin`). */
  readonly canManage: boolean;
  /** La partie du carnet par laquelle on entre — chaque bouton de carte ouvre la sienne. */
  readonly view: AddressesView;
  /**
   * Ouvrir directement le formulaire de facturation : c'est le geste de la
   * carte bureau (« Renseigner », « Modifier »). La carte mobile ouvre le détail.
   */
  readonly form: AddressesForm;
}

/**
 * Le panneau **Adresses** de `/mon-compte` — la facturation, les livraisons, et
 * de quoi en AJOUTER, pour de vrai.
 *
 * ## Une partie du carnet
 *
 * Le panneau s'ouvre sur UNE partie — la facturation, ou les livraisons —,
 * celle du bouton qui l'a ouvert.
 *
 * - **La facturation** bascule le panneau sur son formulaire postal : on
 *   revient par Annuler, ou par Enregistrer.
 * - **Une livraison** s'ajoute et se corrige dans son DIALOGUE
 *   (`DeliveryAddressDialog`, depuis le 2026-09-14), empilé par-dessus la
 *   liste : postal, note, point GPS, créneaux, contact sur place et signature —
 *   la parité avec le back-office. Au succès, la liste est celle que l'écriture
 *   a relue : l'adresse y apparaît à la place que le serveur lui donne.
 *
 * ## Supprimer, désigner la défaut
 *
 * Chaque livraison porte ses deux gestes de ligne, aux rôles qui écrivent :
 * « Définir par défaut » (absent sur la défaut, qui l'est déjà) et
 * « Supprimer », confirmé EN PLACE par `fold-inline-confirm` — annuler
 * n'appelle rien. Le carnet est RELU après chacun : archiver la défaut en fait
 * promouvoir une autre par le serveur, et l'écran ne la devine pas. Un refus
 * s'affiche en tête de la liste, qui reste à l'écran.
 *
 * Le refus d'une facturation reste affiché dans le formulaire resté ouvert ;
 * celui d'une livraison, dans son dialogue.
 */
@Component({
  selector: 'app-addresses-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressForm,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './addresses-panel.html',
  styleUrl: './addresses-panel.scss',
})
export class AddressesPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(
    panels: FoldPanelHostService,
    company: CompanyView,
    view: AddressesView,
    form: AddressesForm,
  ): void {
    panels.open(AddressesPanel, {
      side: panelSide(),
      data: { companyId: company.id, canManage: canWriteAddresses(company), view, form },
    });
  }

  readonly data = input.required<AddressesPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly addresses = inject(ClientAddresses);
  private readonly client = inject(ClientCompany);
  private readonly service = inject(ServicePoints);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly mode = signal<AddressesMode>('list');
  protected readonly draft = signal<PostalDraft>(EMPTY_POSTAL_DRAFT);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** L'action de ligne en vol — une seule à la fois, sur tout le carnet. */
  protected readonly pending = signal<RowAction | null>(null);
  /** Le message du dernier refus d'une action de ligne, montré en tête de liste. */
  protected readonly rowRefusal = signal<string | null>(null);

  /** Les mots de la confirmation en place : fold parle anglais par défaut. */
  protected readonly removeLabels = computed<Partial<FoldInlineConfirmLabels>>(() => {
    const copy = this.t().account;
    return {
      confirm: copy.addressRemoveConfirm,
      cancel: copy.cancel,
      busy: copy.addressRemoveBusy,
      group: copy.addressRemoveGroup,
    };
  });

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

  protected readonly fields = DEFAULT_POSTAL_FIELDS;

  protected readonly heading = computed(() => {
    const copy = this.t().account;
    if (this.data().view === 'delivery') {
      return copy.deliveryHead;
    }
    if (this.mode() === 'form') {
      return this.addresses.billing() === null ? copy.billingFill : copy.billingEdit;
    }
    return copy.billingHead;
  });

  protected readonly postal = computed(() => toPostal(this.draft()));

  protected readonly canSave = computed(() => !this.saving() && postalIssue(this.draft()) === '');

  constructor() {
    // L'ouverture peut aller droit au formulaire de facturation : un effet,
    // puisque `data` n'est pas encore posé quand le constructeur tourne.
    effect(() => {
      const { view, form } = this.data();
      untracked(() => {
        if (view === 'billing' && form !== null) {
          this.editBilling();
        }
      });
    });
  }

  /** Une livraison neuve, dans son dialogue — cochée « par défaut » si le carnet est vide. */
  protected addDelivery(): Promise<void> {
    return this.openDelivery(null);
  }

  /** Corrige une livraison du carnet dans son dialogue, préremplie EN ENTIER. */
  protected editDelivery(addressId: string): Promise<void> {
    const address = this.addresses.deliveries().find((a) => a.id === addressId);
    return address === undefined ? Promise.resolve() : this.openDelivery(address);
  }

  /** Pose ou corrige la facturation : préremplie quand elle existe. */
  protected editBilling(): void {
    const billing = this.addresses.billing();
    this.startForm(billing === null ? EMPTY_POSTAL_DRAFT : postalDraftFrom(billing));
  }

  protected setPostal(postal: PostalAddress): void {
    this.draft.update((draft) => withPostal(draft, postal));
  }

  protected backToList(): void {
    this.mode.set('list');
    this.refusal.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
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
      this.mode.set('list');
    } else {
      this.refusal.set(refusal);
    }
  }

  /** Vrai quand CETTE action de ligne est en vol — pour le chargement de son seul bouton. */
  protected isPending(addressId: string, kind: RowAction['kind']): boolean {
    const pending = this.pending();
    return pending !== null && pending.addressId === addressId && pending.kind === kind;
  }

  /** Appelé par `fold-inline-confirm` : l'annulation, elle, n'arrive jamais ici. */
  protected removeDelivery(addressId: string): Promise<void> {
    return this.rowAction(
      { addressId, kind: 'remove' },
      (companyId) => this.addresses.removeDelivery(companyId, addressId),
      this.t().account.addressRemovedToast,
    );
  }

  protected makeDefault(addressId: string): Promise<void> {
    return this.rowAction(
      { addressId, kind: 'default' },
      (companyId) => this.addresses.makeDefaultDelivery(companyId, addressId),
      this.t().account.addressDefaultToast,
    );
  }

  /**
   * Une action de ligne à la fois : deux clics rapides sur deux lignes
   * partiraient sinon en parallèle, et la relecture de l'une écraserait l'autre.
   */
  private async rowAction(
    action: RowAction,
    call: (companyId: string) => Promise<string | null>,
    toast: string,
  ): Promise<void> {
    if (!this.data().canManage || this.pending() !== null) {
      return;
    }
    this.pending.set(action);
    this.rowRefusal.set(null);
    const refusal = await call(this.data().companyId);
    this.pending.set(null);
    if (refusal === null) {
      this.notify.success(toast);
    } else {
      this.rowRefusal.set(refusal);
    }
  }

  /**
   * Empile le dialogue par-dessus la liste. Au succès, l'écriture a déjà relu
   * le carnet partagé (`ClientAddresses.write`) : la liste est à jour quand le
   * dialogue se ferme, sans seconde lecture ; le refus d'une action de ligne
   * précédente, lui, n'a plus lieu d'être.
   */
  private async openDelivery(address: DeliveryAddressView | null): Promise<void> {
    const company = this.client.company();
    if (company === null || !this.data().canManage) {
      return;
    }
    const firstOfBook = this.addresses.deliveries().length === 0;
    const ref = DeliveryAddressDialog.open(this.panels, company, address, firstOfBook, true);
    if ((await ref.closed) === true) {
      this.rowRefusal.set(null);
    }
  }

  private startForm(draft: PostalDraft): void {
    this.draft.set(draft);
    this.refusal.set(null);
    this.mode.set('form');
  }
}
