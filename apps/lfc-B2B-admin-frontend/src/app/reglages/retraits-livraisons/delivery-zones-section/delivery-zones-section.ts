import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { DeliveryZoneView } from '@lfd/contracts';
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

import { NotifyService } from '../../../notify.service';
import { formatAdjustment } from '../cart-adjustment-format';
import { DeliveryZonesService } from '../delivery-zones.service';
import { ZonePanel, type ZonePanelData } from './zone-panel/zone-panel';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Section **Zones de livraison** des Réglages Retraits & livraisons (staff) — un
 * code postal → un frais de livraison ajouté au panier (stations éloignées :
 * Val d'Isère, Tignes…). Ajouter / éditer / supprimer. La saisie passe par
 * `ZonePanel` ; ici on liste, on ouvre le panneau et on recharge.
 */
@Component({
  selector: 'app-delivery-zones-section',
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
  ],
  templateUrl: './delivery-zones-section.html',
  styleUrl: './delivery-zones-section.scss',
})
export class DeliveryZonesSection {
  private readonly zones = inject(DeliveryZonesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly list = signal<readonly DeliveryZoneView[]>([]);
  protected readonly confirmingId = signal<string | null>(null);

  protected readonly fee = formatAdjustment;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.list.set(await this.zones.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected add(): void {
    void this.openPanel({ zone: null });
  }

  protected edit(zone: DeliveryZoneView): void {
    void this.openPanel({ zone });
  }

  private async openPanel(data: ZonePanelData): Promise<void> {
    const ref = this.panels.open<ZonePanelData | undefined, boolean>(ZonePanel, {
      data,
      width: 'md',
    });
    if ((await ref.closed) === true) {
      await this.load();
    }
  }

  protected askRemove(zone: DeliveryZoneView): void {
    this.confirmingId.set(zone.id);
  }

  protected async confirmRemove(zone: DeliveryZoneView): Promise<void> {
    this.confirmingId.set(null);
    try {
      await this.zones.remove(zone.id);
      this.notify.success('Zone de livraison supprimée.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }
}
