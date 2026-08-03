import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import type { BillingAddressView, DeliveryAddressView, DeliveryContact } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { CompanyAddressesCard } from '@lfd/b2b-ui/company';

import type { Company } from '../../account/account.model';
import { AddressesService } from '../../entreprises/addresses.service';
import { PlatformSettingsService } from '../../entreprises/platform-settings.service';
import { AdressePanel, type AdressePanelData } from '../adresse-panel/adresse-panel';

/**
 * Section **Adresses** d'une entreprise côté **client** — _container_ de la
 * carte présentationnelle `@lfd/b2b-ui/company`. Lit/écrit les adresses sur la
 * vraie API par entreprise (`AddressesService`), calcule la capacité
 * (gestionnaire) et câble les intentions de la carte vers le side-panel et le
 * service. La présentation (facturation + livraisons dépliables) vit dans la lib.
 */
@Component({
  selector: 'app-adresses-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompanyAddressesCard],
  templateUrl: './adresses-section.html',
})
export class AdressesSection {
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly addresses = inject(AddressesService);
  private readonly settings = inject(PlatformSettingsService);

  readonly company = input.required<Company>();

  protected readonly canManage = computed(() => this.company().role === 'company_admin');
  /** Masque le bloc livraison tant que le service n'existe pas (config globale). */
  protected readonly deliveryHidden = this.settings.deliveryHidden;
  protected readonly view = this.addresses.view;

  /** Contacts de l'entreprise proposés pour préremplir le contact de livraison. */
  private readonly knownContacts = computed<readonly DeliveryContact[]>(() => {
    const company = this.company();
    return [company.primaryContact, ...company.contacts].map((contact) => ({
      prenom: contact.firstName,
      nom: contact.lastName,
      telephone: contact.phone,
    }));
  });
  protected readonly billing = computed<BillingAddressView | null>(
    () => this.view()?.billing ?? null,
  );
  protected readonly deliveries = computed<readonly DeliveryAddressView[]>(
    () => this.view()?.deliveries ?? [],
  );

  constructor() {
    // Charge (ou recharge) les adresses de l'entreprise affichée.
    effect(() => this.addresses.loadFor(this.company().id));
  }

  protected editBilling(): void {
    const data: AdressePanelData = {
      companyId: this.company().id,
      kind: 'facturation',
      address: this.billing(),
    };
    this.panelHost.open(AdressePanel, { data, side: 'right' });
  }

  protected addDelivery(): void {
    const data: AdressePanelData = {
      companyId: this.company().id,
      kind: 'livraison',
      address: null,
      knownContacts: this.knownContacts(),
    };
    this.panelHost.open(AdressePanel, { data, side: 'right' });
  }

  protected editDelivery(address: DeliveryAddressView): void {
    const data: AdressePanelData = {
      companyId: this.company().id,
      kind: 'livraison',
      address,
      knownContacts: this.knownContacts(),
    };
    this.panelHost.open(AdressePanel, { data, side: 'right' });
  }

  protected setDefault(address: DeliveryAddressView): void {
    this.addresses.setDefaultDelivery(this.company().id, address.id);
  }

  protected remove(address: DeliveryAddressView): void {
    this.addresses.removeDelivery(this.company().id, address.id);
  }
}
