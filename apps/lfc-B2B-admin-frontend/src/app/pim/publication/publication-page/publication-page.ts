import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { PublicationB2b } from '../publication-b2b/publication-b2b';
import { PublicationTvaCollections } from '../publication-tva-collections/publication-tva-collections';
import { PublicationShopify } from '../publication-shopify/publication-shopify';

/**
 * Hub de **publication** — le catalogue FOLIE COFFEE poussé vers ses canaux.
 *
 * Deux canaux réels : Shopify, et la **boutique B2B** — celle qui facture.
 * L'onglet B2B a longtemps manqué alors que le canal savait pousser côté
 * serveur : prix, taux de TVA et publications n'avaient donc aucun chemin
 * jusqu'à la boutique depuis cet écran.
 *
 * L'onglet Shopify se lit en deux temps, dans l'ordre où la boutique se
 * construit : les **collections de taxe** d'abord (rapatriées du référentiel des
 * taux, qui n'avait pas à pousser), les **produits** ensuite.
 */
@Component({
  selector: 'app-publication-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldNavLayoutComponent,
    FoldPageSectionComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    PublicationB2b,
    PublicationShopify,
    PublicationTvaCollections,
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
