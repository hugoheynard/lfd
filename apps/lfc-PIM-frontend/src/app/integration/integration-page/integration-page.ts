import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import {
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { ShopifyIntegration } from '../shopify-integration/shopify-integration';

/**
 * Hub des **intégrations** — les canaux branchés sur le catalogue. Un nav-layout
 * (Shopify · Autres) héberge chaque page d'intégration ; aujourd'hui seule
 * Shopify est branchée, les suivantes (caisse, marketplace) s'ajouteront comme
 * de nouveaux onglets.
 */
@Component({
  selector: 'app-integration-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    ShopifyIntegration,
  ],
  templateUrl: './integration-page.html',
})
export class IntegrationPage {
  protected readonly tabs: FoldTabItem[] = [
    { key: 'shopify', label: 'Shopify', icon: 'shopify' },
    { key: 'autres', label: 'Autres', icon: 'grid' },
  ];
  protected readonly activeTab = signal('shopify');
}
