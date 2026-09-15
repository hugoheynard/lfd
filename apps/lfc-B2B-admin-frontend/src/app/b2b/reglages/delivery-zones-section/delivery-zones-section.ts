import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { DeliveryZoneView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { formatAdjustmentValue } from '@lfd/b2b-ui/pricing';
import { DeliveryZonesService } from '../delivery-zones.service';
import { ZonePanel, type ZonePanelData } from './zone-panel/zone-panel';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Section **Zones de livraison** des Réglages Retraits & livraisons (staff) — un
 * code postal → un frais de livraison ajouté au panier (stations éloignées :
 * Val d'Isère, Tignes…). Ajouter / éditer / supprimer : tout passe par
 * `ZonePanel`, la suppression dans sa zone dangereuse depuis le 2026-09-15 (un
 * clic dans le menu de la liste suffisait avant) ; ici on liste, on ouvre le
 * panneau et on recharge.
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
  ],
  templateUrl: './delivery-zones-section.html',
  styleUrl: './delivery-zones-section.scss',
})
export class DeliveryZonesSection {
  private readonly zones = inject(DeliveryZonesService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly list = signal<readonly DeliveryZoneView[]>([]);

  protected readonly fee = formatAdjustmentValue;

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
}
