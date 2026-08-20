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

import { PublicationShopify } from '../publication-shopify/publication-shopify';

/**
 * Hub de **publication** — le catalogue FOLIE COFFEE poussé vers ses canaux. Un
 * nav-layout (Shopify · Autre) héberge le staging de chaque canal ; aujourd'hui
 * seul Shopify est branché, la caisse / le B2B s'ajouteront comme des onglets.
 */
@Component({
  selector: 'app-publication-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    PublicationShopify,
  ],
  templateUrl: './publication-page.html',
})
export class PublicationPage {
  protected readonly tabs: FoldTabItem[] = [
    { key: 'shopify', label: 'Shopify', icon: 'shopify' },
    { key: 'autre', label: 'Autre', icon: 'grid' },
  ];
  protected readonly activeTab = signal('shopify');
}
