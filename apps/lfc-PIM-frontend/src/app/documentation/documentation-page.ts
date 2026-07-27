import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { SystemDiagram } from './system-diagram/system-diagram';
import { FlowDiagram } from './flow-diagram/flow-diagram';
import { LeafPreview } from './leaf-preview/leaf-preview';

/**
 * Documentation vivante — explique, au fil des onglets, l'architecture des
 * collections et le système en général, schémas à l'appui. Contenu statique :
 * une carte mentale du POC, pas une source de vérité runtime.
 */
@Component({
  selector: 'app-documentation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    SystemDiagram,
    FlowDiagram,
    LeafPreview,
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
  ];

  protected readonly active = signal<string>('overview');
}
