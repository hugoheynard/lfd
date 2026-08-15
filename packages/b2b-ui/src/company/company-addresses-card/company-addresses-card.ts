import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type {
  BillingAddressView,
  DeliveryAddressView,
  DeliveryContact,
  GpsPoint,
  PickupAddressView,
} from '@lfd/contracts';
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
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { AddressView } from '../../address/address-view/address-view';
import type { PostalAddress } from '../../address/address.model';
import { postalFrom } from '../address-form.model';
import {
  formatDeliveryContact,
  formatGps,
  gpsMapUrl,
  hasDeliverySlot,
  type WeeklySlotRow,
  weeklySlots,
} from '../delivery-format';

/**
 * Section **Adresses** d'une société — présentation pure. Une facturation
 * (unique) et des adresses de livraison (dépliables : créneaux hebdo, contact,
 * note, GPS). Prend directement les vues de fil `@lfd/contracts` ; l'expansion
 * et la confirmation de suppression sont de l'état d'UI local, portés ici. Les
 * mutations (via panneau/service) restent au container, atteint par intentions.
 */
@Component({
  selector: 'lfd-company-addresses-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressView,
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
  templateUrl: './company-addresses-card.html',
  styleUrl: './company-addresses-card.scss',
})
export class CompanyAddressesCard {
  /** L'adresse de facturation, ou `null` si non renseignée. */
  readonly billing = input<BillingAddressView | null>(null);
  /** Les adresses de livraison. */
  readonly deliveries = input.required<readonly DeliveryAddressView[]>();
  /** Le gestionnaire peut éditer / ajouter / supprimer. */
  readonly canManage = input(false);
  /**
   * Afficher le bloc **livraison**. `false` quand le service de livraison n'existe
   * pas encore (pièce `hidden` en config) — la carte ne montre alors que la
   * facturation, sur les deux surfaces (client + admin).
   */
  readonly showDeliveries = input(true);
  /**
   * Le **point de retrait** par défaut (laboratoire), ou `null` si aucun n'est
   * configuré. Affichage en lecture seule — la gestion des points vit côté staff
   * (Réglages → Retraits & livraisons), jamais ici.
   */
  readonly pickup = input<PickupAddressView | null>(null);
  /**
   * Afficher le bloc **point de retrait**. `true` quand la livraison est masquée
   * (le retrait est alors l'acheminement) — complémentaire de `showDeliveries`.
   */
  readonly showPickup = input(false);

  /** Éditer la facturation. */
  readonly editBilling = output<void>();
  /** Ajouter une adresse de livraison. */
  readonly addDelivery = output<void>();
  /** Éditer une adresse de livraison (ou compléter ses instructions). */
  readonly editDelivery = output<DeliveryAddressView>();
  /** Définir une adresse comme livraison par défaut. */
  readonly setDefault = output<DeliveryAddressView>();
  /** Supprimer une adresse de livraison (confirmé). */
  readonly remove = output<DeliveryAddressView>();

  /**
   * Ce que la section contient **vraiment**.
   *
   * La phrase était écrite en dur — « une adresse de facturation, une ou
   * plusieurs adresses de livraison » — alors que le bloc livraison disparaît
   * quand le service n'existe pas encore. Elle annonçait des cartes que
   * personne ne verrait, sur l'écran même où l'on cherche ce qui manque.
   */
  protected readonly description = computed(() => {
    if (this.showDeliveries()) {
      return 'Une adresse de facturation, une ou plusieurs adresses de livraison.';
    }
    return this.showPickup()
      ? 'Une adresse de facturation, et le point où ce client retire ses commandes.'
      : 'Une adresse de facturation.';
  });

  /** Adresse dont la confirmation de suppression est ouverte (état UI local). */
  protected readonly confirmingId = signal<string | null>(null);
  /** Adresse dont le détail de livraison est déplié (état UI local). */
  protected readonly expandedId = signal<string | null>(null);

  /** La vue de fil, dans la langue neutre du composant d'adresse. */
  protected postal(view: BillingAddressView): PostalAddress {
    return postalFrom(view);
  }

  /**
   * Idem, mais avec la ville en nom d'usage à défaut d'étiquette : dans une
   * liste, une carte sans titre ne se distingue pas de sa voisine.
   */
  protected named(view: BillingAddressView): PostalAddress {
    return { ...postalFrom(view), label: view.label || view.ville };
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

  /** Supprimable sauf si c'est la seule adresse par défaut restante. */
  protected canRemove(address: DeliveryAddressView): boolean {
    return !(address.isDefault && this.deliveries().length === 1);
  }

  protected askRemove(address: DeliveryAddressView): void {
    this.confirmingId.set(address.id);
  }

  protected confirmRemove(address: DeliveryAddressView): void {
    this.confirmingId.set(null);
    this.remove.emit(address);
  }
}
