import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldInlineConfirmComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { formatAdjustment } from './cart-adjustment-format';
import { CutoffsSection } from './cutoffs-section/cutoffs-section';
import { DeliveryZonesSection } from './delivery-zones-section/delivery-zones-section';
import { PickupAddressesService } from './pickup-addresses.service';
import { openingRows } from './pickup-opening.model';
import { PickupPanel, type PickupPanelData } from './pickup-panel/pickup-panel';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Sous-page **Retraits & livraisons** des Réglages (staff) — gère les **points de
 * retrait** (laboratoires) : ajouter, éditer, supprimer (au moins un gardé),
 * désigner le défaut. La livraison à domicile n'existe pas encore ; le retrait
 * est le fallback d'acheminement, présélectionné au checkout. La saisie passe par
 * `PickupPanel` (side-panel) ; ici on liste, on ouvre le panneau et on recharge.
 */
@Component({
  selector: 'app-reglages-pickup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldBadgeComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldIconComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldInlineConfirmComponent,
    FoldPopoverTriggerDirective,
    CutoffsSection,
    DeliveryZonesSection,
  ],
  templateUrl: './reglages-pickup-page.html',
  styleUrl: './reglages-pickup-page.scss',
})
export class ReglagesPickupPage {
  private readonly pickups = inject(PickupAddressesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly addresses = signal<readonly PickupAddressView[]>([]);
  /** Point dont la confirmation de suppression est ouverte (état UI local). */
  protected readonly confirmingId = signal<string | null>(null);

  /** On garde toujours au moins un point : le dernier n'est pas supprimable. */
  protected readonly canRemove = computed(() => this.addresses().length > 1);

  /** Formate la remise d'un point de retrait pour l'affichage. */
  protected readonly fee = formatAdjustment;
  /** Les plages d'ouverture déclarées, lisibles. Vide = aucune heure opposée. */
  protected readonly hours = openingRows;

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
    void this.openPanel({ address });
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

  protected async setDefault(address: PickupAddressView): Promise<void> {
    try {
      await this.pickups.setDefault(address.id);
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected askRemove(address: PickupAddressView): void {
    this.confirmingId.set(address.id);
  }

  protected async confirmRemove(address: PickupAddressView): Promise<void> {
    this.confirmingId.set(null);
    try {
      await this.pickups.remove(address.id);
      this.notify.success('Point de retrait supprimé.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }
}
