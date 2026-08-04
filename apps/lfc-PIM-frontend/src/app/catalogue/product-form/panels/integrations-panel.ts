import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import {
  FoldEmptyStateComponent,
  FoldNavLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

/** Panneau Intégrations — un **second** nav-layout, **vertical**, qui héberge un
 *  sous-onglet par intégration (B2B, Shopify…). Chaque sous-onglet accueillera
 *  les champs spécifiques à son canal. Vide pour l'instant (à remplir). */
@Component({
  selector: 'app-integrations-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    FoldEmptyStateComponent,
  ],
  templateUrl: './integrations-panel.html',
  styleUrl: './panel.scss',
})
export class IntegrationsPanel {
  protected readonly subTabs: FoldTabItem[] = [
    { key: 'b2b', label: 'B2B', icon: 'store' },
    { key: 'shopify', label: 'Shopify', icon: 'shopify' },
  ];
  protected readonly activeSub = signal<string>('b2b');
}
