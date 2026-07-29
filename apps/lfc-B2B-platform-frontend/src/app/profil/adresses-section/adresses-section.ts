import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCardComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
} from 'fold-ng';

import type { Adresse } from '../../data/profil.model';
import { ProfilService } from '../../data/profil.service';
import { AdressePanel, type AdressePanelData } from '../adresse-panel/adresse-panel';

/**
 * Section **Mes adresses** — une adresse de facturation (unique) et une liste
 * d'adresses de livraison (une par défaut). À la différence des sections
 * d'identité éditées en place, les adresses sont du **CRUD** (ajouter /
 * modifier / supprimer / définir par défaut) : l'ajout et l'édition passent par
 * un side-panel, les actions de statut restent sur la ligne.
 */
@Component({
  selector: 'app-adresses-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
  ],
  templateUrl: './adresses-section.html',
  styleUrl: './adresses-section.scss',
})
export class AdressesSection {
  private readonly panelHost = inject(FoldPanelHostService);
  protected readonly profil = inject(ProfilService);

  protected readonly profile = this.profil.profile;

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

  protected editDelivery(address: Adresse): void {
    const data: AdressePanelData = { kind: 'livraison', address };
    this.panelHost.open(AdressePanel, { data, side: 'right' });
  }

  protected setDefaultDelivery(address: Adresse): void {
    this.profil.setDefaultDelivery(address.id);
  }

  protected removeDelivery(address: Adresse): void {
    this.profil.removeDeliveryAddress(address.id);
  }
}
