import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { CompanyView, DeliveryAddressView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientAddresses } from '../../../client-addresses.service';
import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { BillingAddressDialog } from '../billing-address-dialog/billing-address-dialog';
import {
  type AddressesView,
  canWriteAddresses,
  deliveryCountLabel,
  deliveryRows,
  postalLine,
} from '../addresses-section';
import { DeliveryAddressDialog } from '../delivery-address-dialog/delivery-address-dialog';

/** Charge d'ouverture : la société, et si l'on peut écrire son carnet. */
export interface AddressesPanelData {
  readonly companyId: string;
  /** `owner`/`admin` : ceux que l'API laisse écrire (`ensureCompanyAdmin`). */
  readonly canManage: boolean;
  /** La partie du carnet par laquelle on entre — chaque bouton de carte ouvre la sienne. */
  readonly view: AddressesView;
}

/**
 * Le panneau **Adresses** de `/mon-compte` — la facturation, les livraisons, et
 * de quoi en AJOUTER, pour de vrai.
 *
 * ## Une partie du carnet
 *
 * Le panneau s'ouvre sur UNE partie — la facturation, ou les livraisons —,
 * celle du bouton qui l'a ouvert. Il ne montre que des LISTES : aucun formulaire n'y vit plus (2026-09-14).
 *
 * - **La facturation** se renseigne et se corrige dans son DIALOGUE
 *   (`BillingAddressDialog`), empilé par-dessus : les champs postaux seuls.
 * - **Une livraison** s'ajoute et se corrige dans le sien
 *   (`DeliveryAddressDialog`) : postal, note, point GPS, créneaux, contact sur
 *   place et signature — la parité avec le back-office.
 *
 * Au succès, la liste est celle que l'écriture a relue : l'adresse y apparaît
 * à la place que le serveur lui donne, sans seconde lecture.
 *
 * ## Un clic sur une livraison ouvre son dialogue
 *
 * Plus de boutons de ligne (règle « Saisir », 2026-09-14) : la ligne ne porte
 * que ce qui se lit — libellé, badge « par défaut », ligne postale — et, aux
 * rôles qui écrivent, un clic ouvre `DeliveryAddressDialog`. Le rang « par
 * défaut » se règle par la case du formulaire ; la suppression, dans la zone de
 * danger du dialogue. Le carnet relu montre ce que le serveur en a fait — y
 * compris la défaut qu'il promeut quand on archive la précédente.
 *
 * Le refus d'une écriture d'adresse s'affiche dans son dialogue.
 */
@Component({
  selector: 'app-addresses-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './addresses-panel.html',
  styleUrl: './addresses-panel.scss',
})
export class AddressesPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService, company: CompanyView, view: AddressesView): void {
    panels.open(AddressesPanel, {
      side: panelSide(),
      data: { companyId: company.id, canManage: canWriteAddresses(company), view },
    });
  }

  readonly data = input.required<AddressesPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly addresses = inject(ClientAddresses);
  private readonly client = inject(ClientCompany);
  private readonly service = inject(ServicePoints);
  private readonly panels = inject(FoldPanelHostService);

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

  protected readonly heading = computed(() =>
    this.data().view === 'delivery' ? this.t().account.deliveryHead : this.t().account.billingHead,
  );

  /** Une livraison neuve, dans son dialogue — cochée « par défaut » si le carnet est vide. */
  protected addDelivery(): Promise<void> {
    return this.openDelivery(null);
  }

  /** Corrige une livraison du carnet dans son dialogue, préremplie EN ENTIER. */
  protected editDelivery(addressId: string): Promise<void> {
    const address = this.addresses.deliveries().find((a) => a.id === addressId);
    return address === undefined ? Promise.resolve() : this.openDelivery(address);
  }

  /**
   * Renseigne ou corrige la facturation dans son dialogue, empilé par-dessus la
   * liste. Au succès, l'écriture a relu le carnet : la ligne est à jour au retour.
   */
  protected editBilling(): void {
    const company = this.client.company();
    if (company === null || !this.data().canManage) {
      return;
    }
    BillingAddressDialog.open(this.panels, company, this.addresses.billing(), true);
  }

  /**
   * Empile le dialogue par-dessus la liste. Au succès, l'écriture a déjà relu
   * le carnet partagé (`ClientAddresses.write`) : la liste est à jour quand le
   * dialogue se ferme, sans seconde lecture.
   */
  private async openDelivery(address: DeliveryAddressView | null): Promise<void> {
    const company = this.client.company();
    if (company === null || !this.data().canManage) {
      return;
    }
    const firstOfBook = this.addresses.deliveries().length === 0;
    await DeliveryAddressDialog.open(this.panels, company, address, firstOfBook, true).closed;
  }
}
