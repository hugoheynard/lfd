import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { PublicationB2b } from '../publication-b2b/publication-b2b';
import { PublicationShopify } from '../publication-shopify/publication-shopify';

/**
 * Hub de **publication** — le catalogue FOLIE COFFEE poussé vers ses canaux.
 *
 * Deux canaux réels : Shopify, et la **boutique B2B** — celle qui facture.
 * L'onglet B2B a longtemps manqué alors que le canal savait pousser côté
 * serveur : prix, taux de TVA et publications n'avaient donc aucun chemin
 * jusqu'à la boutique depuis cet écran.
 */
@Component({
  selector: 'app-publication-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    PublicationB2b,
    PublicationShopify,
  ],
  templateUrl: './publication-page.html',
})
export class PublicationPage {
  protected readonly tabs: FoldTabItem[] = [
    { key: 'shopify', label: 'Shopify', icon: 'shopify' },
    // `shopping-bag` (la boutique) et non `shopping-cart` (l'acte de commander),
    // qui nomme l'onglet « Commandes » d'une fiche client. Deux gestes voisins,
    // deux dessins.
    { key: 'b2b', label: 'Boutique B2B', icon: 'shopping-bag' },
  ];
  protected readonly activeTab = signal('shopify');
}
