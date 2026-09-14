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
  AddressForm,
  DEFAULT_POSTAL_FIELDS,
  type PostalAddress,
  type PostalField,
} from '@lfd/b2b-ui/address';
import {
  deliveryDraftFrom,
  EMPTY_DELIVERY_DRAFT,
  postalDraftFrom,
  postalIssue,
  toBillingPayload,
  toDeliveryPayload,
  toPostal,
  withPostal,
  type DeliveryDraft,
} from '@lfd/b2b-ui/company';
import type { CompanyView } from '@lfd/contracts';
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

/** Ce que montre le panneau : la partie du carnet, ou le formulaire d'UNE adresse. */
type AddressesMode = 'list' | 'form';

/** Une action de ligne en vol : sur quelle livraison, et laquelle des deux. */
interface RowAction {
  readonly addressId: string;
  readonly kind: 'remove' | 'default';
}

/** Une livraison se nomme et porte sa note pour les livreurs ; une facturation, non. */
const DELIVERY_FIELDS: readonly PostalField[] = [...DEFAULT_POSTAL_FIELDS, 'note'];

/** Charge d'ouverture : la société, et si l'on peut écrire son carnet. */
export interface AddressesPanelData {
  readonly companyId: string;
  /** `owner`/`admin` : ceux que l'API laisse écrire (`ensureCompanyAdmin`). */
  readonly canManage: boolean;
  /** La partie du carnet par laquelle on entre — chaque bouton de carte ouvre la sienne. */
  readonly view: AddressesView;
  /**
   * Ouvrir directement un formulaire : c'est le geste de la carte bureau
   * (« Ajouter », « Modifier », « Renseigner »). La carte mobile ouvre le détail.
   */
  readonly form: AddressesForm;
}

/**
 * Le panneau **Adresses** de `/mon-compte` — la facturation, les livraisons, et
 * de quoi en AJOUTER, pour de vrai.
 *
 * ## Une partie du carnet, puis son formulaire
 *
 * Le panneau s'ouvre sur UNE partie — la facturation, ou les livraisons —,
 * celle du bouton qui l'a ouvert. « Ajouter » ou « Renseigner » bascule le
 * panneau sur le formulaire au lieu d'en empiler un second : on revient par
 * Annuler, ou par Enregistrer, qui retombe sur la liste RELUE — l'adresse y
 * apparaît à la place que le serveur lui donne (la défaut en tête).
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
 * ## Ce qui n'y est pas
 *
 * Ni créneaux ni contact sur place :
 * une adresse neuve part sans consignes horaires ni contact (`noContact`), et
 * devient la défaut seulement si c'est la première ; une adresse modifiée
 * garde les siens. Le formulaire complet reste
 * celui du back-office et de l'ancien écran « Mes entreprises ».
 *
 * Le refus reste affiché dans le formulaire resté ouvert, sous les champs
 * qu'il nomme.
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
  private readonly service = inject(ServicePoints);
  private readonly notify = inject(NotifyService);

  protected readonly mode = signal<AddressesMode>('list');
  protected readonly draft = signal<DeliveryDraft>(EMPTY_DELIVERY_DRAFT);
  /** La livraison en cours de modification, `null` pour un ajout. */
  private readonly editing = signal<string | null>(null);
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

  protected readonly fields = computed(() =>
    this.data().view === 'delivery' ? DELIVERY_FIELDS : DEFAULT_POSTAL_FIELDS,
  );

  protected readonly heading = computed(() => {
    const copy = this.t().account;
    const billing = this.data().view === 'billing';
    if (this.mode() === 'form') {
      if (billing) {
        return this.addresses.billing() === null ? copy.billingFill : copy.billingEdit;
      }
      return this.editing() === null ? copy.addressAdd : copy.addressEdit;
    }
    return billing ? copy.billingHead : copy.deliveryHead;
  });

  protected readonly postal = computed(() => toPostal(this.draft()));

  protected readonly canSave = computed(() => !this.saving() && postalIssue(this.draft()) === '');

  /**
   * Une adresse neuve n'a ni créneau ni contact sur place (`noContact`) : sans
   * lui, la charge porterait un contact aux trois champs vides, que le contrat
   * refuse. Elle devient la défaut seulement si le carnet est vide.
   */
  constructor() {
    // L'ouverture peut aller droit au formulaire : un effet, puisque `data`
    // n'est pas encore posé quand le constructeur tourne.
    effect(() => {
      const { view, form } = this.data();
      untracked(() => {
        if (form === null) {
          return;
        }
        if (view === 'billing') {
          this.editBilling();
        } else if (form.kind === 'edit' && form.addressId !== null) {
          this.editDelivery(form.addressId);
        } else {
          this.addDelivery();
        }
      });
    });
  }

  protected addDelivery(): void {
    this.editing.set(null);
    this.startForm({
      ...EMPTY_DELIVERY_DRAFT,
      noContact: true,
      isDefault: this.deliveries().length === 0,
    });
  }

  /**
   * Modifie une livraison du carnet, préremplie EN ENTIER : ses créneaux, son
   * contact et son point GPS repartent tels quels, puisque le formulaire ne
   * les montre pas — une modification ne doit pas les effacer.
   */
  protected editDelivery(addressId: string): void {
    const address = this.addresses.deliveries().find((a) => a.id === addressId);
    if (address === undefined) {
      return;
    }
    this.editing.set(addressId);
    this.startForm(deliveryDraftFrom(address));
  }

  /** Pose ou corrige la facturation : préremplie quand elle existe. */
  protected editBilling(): void {
    const billing = this.addresses.billing();
    this.startForm(
      billing === null
        ? EMPTY_DELIVERY_DRAFT
        : { ...EMPTY_DELIVERY_DRAFT, ...postalDraftFrom(billing) },
    );
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
    const { companyId } = this.data();
    const draft = this.draft();
    this.saving.set(true);
    this.refusal.set(null);
    const editing = this.editing();
    const refusal =
      this.data().view === 'billing'
        ? await this.addresses.saveBilling(companyId, toBillingPayload(draft))
        : editing === null
          ? await this.addresses.addDelivery(companyId, toDeliveryPayload(draft))
          : await this.addresses.updateDelivery(companyId, editing, toDeliveryPayload(draft));
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

  private startForm(draft: DeliveryDraft): void {
    this.draft.set(draft);
    this.refusal.set(null);
    this.mode.set('form');
  }
}
