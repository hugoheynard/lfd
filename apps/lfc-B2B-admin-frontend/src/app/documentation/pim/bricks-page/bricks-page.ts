import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldCardComponent, FoldElementTitleComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * **Les briques** — le vocabulaire minimal du référentiel, une carte par objet.
 *
 * Elle ne montre aucun schéma : c'est la seule page de définitions, et un
 * diagramme y mettrait des flèches là où il n'y a encore que des mots.
 */
@Component({
  selector: 'app-doc-bricks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './bricks-page.html',
  styleUrl: '../../doc-page.scss',
})
export class DocBricksPage {}
