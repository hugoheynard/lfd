import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';

import type { BillingAddressView, DeliveryAddressView, DeliveryContact, GpsPoint } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import type { Company } from '../../account/account.model';
import { AddressesService } from '../../entreprises/addresses.service';
import {
  formatDeliveryContact,
  formatGps,
  gpsMapUrl,
  hasDeliverySlot,
  type WeeklySlotRow,
  weeklySlots,
} from '../../entreprises/delivery-format';
import { AdressePanel, type AdressePanelData } from '../adresse-panel/adresse-panel';

/**
 * Section **Adresses** d'une entreprise — une facturation (unique) et des
 * adresses de livraison (une par défaut), lues et écrites sur la **vraie API**
 * (`/companies/:id/addresses`), par entreprise. L'ajout/édition passe par un
 * side-panel ; les actions par ligne vivent dans un dropover avec confirmation
 * *inline* de la suppression. Édition réservée au **gestionnaire**.
 */
@Component({
  selector: 'app-adresses-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldIconComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldInlineConfirmComponent,
    FoldCalloutComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './adresses-section.html',
  styleUrl: './adresses-section.scss',
})
export class AdressesSection {
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly addresses = inject(AddressesService);

  readonly company = input.required<Company>();

  protected readonly canManage = computed(() => this.company().role === 'company_admin');
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
  protected readonly billing = computed<BillingAddressView | null>(() => this.view()?.billing ?? null);
  protected readonly deliveries = computed<readonly DeliveryAddressView[]>(
    () => this.view()?.deliveries ?? [],
  );

  /** L'adresse dont on confirme la suppression (inline), ou `null`. */
  protected readonly confirmingId = signal<string | null>(null);
  /** L'adresse dont le détail de livraison est déplié, ou `null`. */
  protected readonly expandedId = signal<string | null>(null);

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

  /** Commandable seulement si un créneau de livraison est défini. */
  protected isUsable(address: DeliveryAddressView): boolean {
    return hasDeliverySlot(address.specs.slots);
  }

  protected weekly(address: DeliveryAddressView): readonly WeeklySlotRow[] {
    return weeklySlots(address.specs.slots);
  }

  protected contactName(contact: DeliveryContact): string {
    return formatDeliveryContact(contact);
  }

  protected gpsText(gps: GpsPoint): string {
    return formatGps(gps);
  }

  protected gpsLink(gps: GpsPoint): string {
    return gpsMapUrl(gps);
  }

  protected toggleDetails(address: DeliveryAddressView): void {
    this.expandedId.update((id) => (id === address.id ? null : address.id));
  }

  protected addInstructions(address: DeliveryAddressView): void {
    this.editDelivery(address);
  }

  protected setDefaultDelivery(address: DeliveryAddressView): void {
    this.addresses.setDefaultDelivery(this.company().id, address.id);
  }

  /** Supprimable sauf si c'est la seule adresse par défaut restante. */
  protected canRemove(address: DeliveryAddressView): boolean {
    return !(address.isDefault && this.deliveries().length === 1);
  }

  protected askRemove(address: DeliveryAddressView): void {
    this.confirmingId.set(address.id);
  }

  protected confirmRemove(address: DeliveryAddressView): void {
    this.confirmingId.set(null);
    this.addresses.removeDelivery(this.company().id, address.id);
  }
}
