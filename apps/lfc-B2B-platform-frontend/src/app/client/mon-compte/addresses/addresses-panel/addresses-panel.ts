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
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { ClientCopyService, fill } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { ServicePoints } from '../../../shop/pickup-points.store';
import {
  type AddressesForm,
  type AddressesView,
  canWriteAddresses,
  deliveryRows,
  postalLine,
} from '../addresses-section';

/** Ce que montre le panneau : la partie du carnet, ou le formulaire d'UNE adresse. */
type AddressesMode = 'list' | 'form';

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
 * ## Ce qui n'y est pas
 *
 * Ni suppression, ni changement de défaut, ni créneaux ni contact sur place :
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
    fill(this.t().account.deliveryCount, { n: String(this.deliveries().length) }),
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

  private startForm(draft: DeliveryDraft): void {
    this.draft.set(draft);
    this.refusal.set(null);
    this.mode.set('form');
  }
}
