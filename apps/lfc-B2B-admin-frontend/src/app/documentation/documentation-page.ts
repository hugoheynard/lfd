import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { ContextAnatomyDiagram } from './context-anatomy-diagram/context-anatomy-diagram';
import { OfferDiagram } from './offer-diagram/offer-diagram';
import { SystemDiagram } from './system-diagram/system-diagram';
import { TwoAxesDiagram } from './two-axes-diagram/two-axes-diagram';
import { FlowDiagram } from './flow-diagram/flow-diagram';
import { LeafPreview } from './leaf-preview/leaf-preview';
import { UpsertDiagram } from './upsert-diagram/upsert-diagram';

/**
 * Documentation vivante — explique, section par section, l'architecture des
 * collections et le système en général, schémas à l'appui. Contenu statique :
 * une carte mentale du POC, pas une source de vérité runtime.
 *
 * Les sections se rangent dans un **rail latéral**, comme le PIM et le
 * Commercial : c'est la troisième section à onglets de l'app, et trois façons
 * différentes de ranger la même chose obligent à réapprendre l'écran à chaque
 * changement de section.
 *
 * La section **Contextes de vente** répond à une question posée en clair — « à
 * quoi ça sert, et comment j'ajoute une caisse ? ». Elle vit ici et pas dans un
 * `.md` du dépôt parce que la personne qui se la pose est devant l'écran, pas
 * devant l'éditeur.
 *
 * La barre reste un `fold-tabs` et non un `fold-view-nav` : ici rien ne
 * navigue — six panneaux sur la même URL. Le rail est une affaire de layout,
 * pas de sémantique.
 */
@Component({
  selector: 'app-documentation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldNavLayoutComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    SystemDiagram,
    ContextAnatomyDiagram,
    TwoAxesDiagram,
    OfferDiagram,
    FlowDiagram,
    LeafPreview,
    UpsertDiagram,
  ],
  templateUrl: './documentation-page.html',
  styleUrl: './documentation-page.scss',
})
export class DocumentationPage {
  protected readonly tabs: FoldTabItem[] = [
    { key: 'overview', label: 'Vue d’ensemble', icon: 'info' },
    { key: 'bricks', label: 'Les briques', icon: 'grid' },
    { key: 'flow', label: 'Flux des collections', icon: 'sliders' },
    { key: 'web', label: 'Segmentation web', icon: 'globe' },
    // `places` et `shopify` viennent du catalogue de l'app
    // (`shared/icons/app-icons.ts`) : ce sont DÉJÀ les glyphes que le rail du
    // PIM pose sur « Emplacements » et « Publication ». Les génériques d'avant
    // (`company`, `upload`) montraient deux icônes différentes pour la même
    // chose, à un rail d'écart.
    { key: 'contexts', label: 'Contextes de vente', icon: 'sliders' },
    { key: 'locations', label: 'Points de vente', icon: 'places' },
    { key: 'shopify', label: 'Intégration Shopify', icon: 'shopify' },
  ];

  protected readonly active = signal<string>('overview');
}
