import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { B2bIntegration } from '../b2b-integration/b2b-integration';
import { ShopifyCatalogue } from '../shopify-catalogue/shopify-catalogue';
import { ShopifyIntegration } from '../shopify-integration/shopify-integration';

/**
 * Hub des **intégrations** — les canaux branchés sur le catalogue.
 *
 * La **boutique B2B en premier**, et c'est un ordre de vérité : c'est elle qui
 * facture. Elle manquait entièrement à cet écran, dont l'état vide affirmait que
 * « Shopify est le seul canal branché » — faux depuis que le catalogue et les
 * taux descendent vers la plateforme.
 *
 * L'onglet « Autres » part avec : un inventaire des canaux tenu à la main est un
 * inventaire qui ment dès qu'un canal arrive, et c'est exactement ce qui s'est
 * produit. Un nouveau canal s'ajoute en onglet, pas en promesse.
 */
@Component({
  selector: 'app-integration-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    B2bIntegration,
    ShopifyIntegration,
    ShopifyCatalogue,
  ],
  templateUrl: './integration-page.html',
  styleUrl: './integration-page.scss',
})
export class IntegrationPage {
  protected readonly tabs: FoldTabItem[] = [
    { key: 'b2b', label: 'Boutique B2B', icon: 'shopping-bag' },
    { key: 'shopify', label: 'Shopify', icon: 'shopify' },
  ];
  protected readonly activeTab = signal('b2b');
}
