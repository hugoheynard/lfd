import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldCardComponent, FoldElementTitleComponent, FoldPageLayoutComponent } from 'fold-ng';

import { FlowDiagram } from '../../flow-diagram/flow-diagram';
import { LeafPreview } from '../../leaf-preview/leaf-preview';

/**
 * **Flux des collections** — les trois calques, puis leur résultat concret.
 *
 * L'aperçu de feuille reste sur cette page et pas sur une à elle : il n'est pas
 * une démonstration, c'est la DERNIÈRE étape du flux qu'on vient de décrire, et
 * le séparer laisserait le schéma s'arrêter avant d'avoir rien montré.
 */
@Component({
  selector: 'app-doc-collections-flow-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FlowDiagram,
    LeafPreview,
  ],
  templateUrl: './collections-flow-page.html',
  styleUrl: '../../doc-page.scss',
})
export class DocCollectionsFlowPage {}
