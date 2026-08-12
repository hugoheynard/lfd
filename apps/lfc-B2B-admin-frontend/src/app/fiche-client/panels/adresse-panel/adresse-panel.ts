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
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';
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
  /**
   * L'adresse de **facturation** à corriger ; absente, on en pose une.
   *
   * Elle manquait, et le panneau s'ouvrait donc vide sur une adresse déjà
   * renseignée : corriger un numéro de rue obligeait à retaper les six champs,
   * et ce qu'on retape sous la dictée, on le fausse.
   */
  readonly billing?: BillingAddressView | undefined;
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
  /**
   * Nature du panneau : tiroir latéral au large, **bottom-sheet** sur étroit
   * (`side: 'auto'`). Un tiroir de 490 px sur un téléphone, c'est un plein
   * écran qui feint d'être un côté ; la feuille par le bas dit ce qu'elle est
   * et laisse le pouce à portée du pied de panneau.
   *
   * Déclaré ICI : le côté appartient à la nature du panneau, pas au geste qui
   * l'ouvre — six call-sites répétant `side` finissent par diverger.
   */
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

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
      return this.data().billing === undefined
        ? 'Adresse de facturation'
        : 'Modifier l’adresse de facturation';
    }
    return this.editing() === undefined
      ? 'Nouvelle adresse de livraison'
      : 'Modifier l’adresse de livraison';
  });
  protected readonly canSubmit = computed(() => isAddressValid(this.draft(), this.kind()));

  constructor() {
    // Préremplir depuis l'adresse à corriger : un formulaire vide obligerait à
    // tout retaper pour changer un code d'accès, et ce qui se retape se perd.
    // Les DEUX natures se préremplissent — la facturation ne le faisait pas, et
    // « Modifier » ouvrait donc un formulaire vierge sur une adresse existante.
    effect(() => {
      const delivery = this.editing();
      if (delivery !== undefined) {
        this.draft.set(deliveryDraftFrom(delivery));
        return;
      }
      const billing = this.data().billing;
      if (billing !== undefined) {
        this.draft.set(billingDraftFrom(billing));
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
