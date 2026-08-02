import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldPanelHeaderComponent, FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

import { AcquisitionSettingsService } from './acquisition-settings.service';

/**
 * Panneau **Réglages commercial** (ouvert via `FoldPanelHostService.open`). Un
 * `fold-view-nav` **horizontal, fond transparent, fill**, en mode `activeKey`
 * (onglets en place, pas de route). Premier onglet **Alertes acquisition** : les
 * seuils (jours) qui font monter la couleur d'un créneau en attente — écrits
 * dans `AcquisitionSettingsService`, relus en direct par le calendrier.
 */
@Component({
  selector: 'app-commercial-settings-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldViewNavComponent],
  templateUrl: './commercial-settings-panel.html',
  styleUrl: './commercial-settings-panel.scss',
})
export class CommercialSettingsPanel {
  protected readonly settings = inject(AcquisitionSettingsService);

  protected readonly tabs: FoldViewNavItem[] = [
    { key: 'alerts', label: 'Alertes acquisition', icon: 'calendar' },
  ];
  protected readonly active = signal('alerts');
}
