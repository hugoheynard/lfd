import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import { AddressView } from '@lfd/b2b-ui/address';
import { HoursView } from '@lfd/b2b-ui/hours';
import { postalFrom } from '@lfd/b2b-ui/company';
import { formatAdjustmentValue } from '@lfd/b2b-ui/pricing';
import type { PostalAddress } from '@lfd/b2b-ui/address';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PickupAddressesService } from '../pickup-addresses.service';
import { discountAudienceSuffix } from '../pickup-discount-audience';
import { openingRows } from '../pickup-opening.model';
import { PickupPanel, type PickupPanelData } from '../pickup-panel/pickup-panel';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Points de retrait** — « E-commerce LFC → Réglages ». Les laboratoires où le
 * client vient chercher sa commande : ajouter, éditer, désigner le défaut. La
 * saisie ET la suppression passent par `PickupPanel` — la seconde dans sa zone
 * dangereuse, depuis le 2026-09-15 (un clic dans le menu de la liste suffisait
 * avant) ; ici on liste, on ouvre le panneau et on recharge.
 *
 * Elle était la première carte d'un onglet « Retraits & livraisons » des
 * Réglages, avec les zones et les heures limites. Les trois se sont séparées le
 * 2026-09-15 (plan « remise et livraison par clientèle », D6) : chacune a sa
 * page, et l'ancienne adresse redirige ici.
 */
@Component({
  selector: 'app-pickup-addresses-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressView,
    HoursView,
    FoldCardComponent,
    FoldBadgeComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldButtonComponent,
    FoldIconComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './pickup-addresses-page.html',
  styleUrl: './pickup-addresses-page.scss',
})
export class PickupAddressesPage {
  private readonly pickups = inject(PickupAddressesService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly addresses = signal<readonly PickupAddressView[]>([]);
  /** On garde toujours au moins un point : le dernier n'est pas supprimable. */
  protected readonly canRemove = computed(() => this.addresses().length > 1);

  /** Les plages d'ouverture déclarées, lisibles. Vide = aucune heure opposée. */
  protected readonly hours = openingRows;

  /**
   * « − 10 % · B2B » : la remise ET à qui elle va. Sans la clientèle, une remise
   * fermée aux particuliers se lirait comme offerte à tous.
   */
  protected discountLabel(point: PickupAddressView): string {
    if (point.discount === null) {
      return '';
    }
    return `− ${formatAdjustmentValue(point.discount)}${discountAudienceSuffix(point.discountAudiences)}`;
  }

  /**
   * L'adresse à afficher. Un point sans nom d'usage prend celui de sa ville :
   * une carte sans titre ne se distingue pas de sa voisine dans la liste.
   */
  protected postal(point: PickupAddressView): PostalAddress {
    return { ...postalFrom(point), label: point.label || point.ville };
  }

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.addresses.set(await this.pickups.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected add(): void {
    void this.openPanel({ address: null });
  }

  protected edit(address: PickupAddressView): void {
    void this.openPanel({ address, removable: this.canRemove() });
  }

  /** Ouvre le panneau, puis recharge la liste si une sauvegarde a eu lieu. */
  private async openPanel(data: PickupPanelData): Promise<void> {
    const ref = this.panels.open<PickupPanelData | undefined, boolean>(PickupPanel, {
      data,
      width: 'md',
    });
    const saved = await ref.closed;
    if (saved === true) {
      await this.load();
    }
  }
}
