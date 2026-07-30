import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

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

import {
  type Adresse,
  type AdresseLivraison,
  type DeliveryContact,
  formatDeliveryContact,
  formatGps,
  type GpsPoint,
  gpsMapUrl,
  hasDeliverySlot,
  type WeeklySlotRow,
  weeklySlots,
} from '../../data/profil.model';
import { ProfilService } from '../../data/profil.service';
import { AdressePanel, type AdressePanelData } from '../adresse-panel/adresse-panel';

/**
 * Section **Mes adresses** — une adresse de facturation (unique) et une liste
 * d'adresses de livraison (une par défaut). L'ajout et l'édition passent par un
 * side-panel ; les actions par ligne (par défaut / modifier / supprimer) vivent
 * dans un **menu dropover**, comme les contacts, avec confirmation *inline* de la
 * suppression.
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
  protected readonly profil = inject(ProfilService);

  protected readonly profile = this.profil.profile;

  /** L'adresse dont on confirme la suppression (inline), ou `null`. */
  protected readonly confirmingId = signal<string | null>(null);

  /** L'adresse dont le détail de livraison est déplié, ou `null`. */
  protected readonly expandedId = signal<string | null>(null);

  protected editBilling(): void {
    const data: AdressePanelData = {
      kind: 'facturation',
      address: this.profile().adresseFacturation,
    };
    this.panelHost.open(AdressePanel, { data, side: 'right' });
  }

  protected addDelivery(): void {
    const data: AdressePanelData = { kind: 'livraison', address: null };
    this.panelHost.open(AdressePanel, { data, side: 'right' });
  }

  protected editDelivery(address: AdresseLivraison): void {
    const data: AdressePanelData = { kind: 'livraison', address };
    this.panelHost.open(AdressePanel, { data, side: 'right' });
  }

  /**
   * Commandable seulement si un créneau de livraison est défini. Sans créneau,
   * la carte affiche un avertissement plutôt qu'un détail.
   */
  protected isUsable(address: AdresseLivraison): boolean {
    return hasDeliverySlot(address.slots);
  }

  /** Vue hebdomadaire pour la visualisation dépliée. */
  protected weekly(address: AdresseLivraison): readonly WeeklySlotRow[] {
    return weeklySlots(address.slots);
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

  /** Déplie / replie le détail de livraison d'une adresse. */
  protected toggleDetails(address: AdresseLivraison): void {
    this.expandedId.update((id) => (id === address.id ? null : address.id));
  }

  /** « Ajouter des instructions » depuis l'avertissement : ouvre l'édition. */
  protected addInstructions(address: AdresseLivraison): void {
    this.editDelivery(address);
  }

  protected setDefaultDelivery(address: Adresse): void {
    this.profil.setDefaultDelivery(address.id);
  }

  /**
   * Supprimable sauf si c'est la seule adresse par défaut restante : une liste
   * non vide doit toujours garder un défaut.
   */
  protected canRemove(address: Adresse): boolean {
    return !(address.isDefaut && this.profil.adressesLivraison().length === 1);
  }

  /** « Supprimer » du menu : ouvre la confirmation inline, sans rien effacer. */
  protected askRemove(address: Adresse): void {
    this.confirmingId.set(address.id);
  }

  protected confirmRemove(address: Adresse): void {
    this.confirmingId.set(null);
    this.profil.removeDeliveryAddress(address.id);
  }
}
