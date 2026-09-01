import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { ProductGatesDiagram } from '../../product-gates-diagram/product-gates-diagram';

/**
 * **Remplir une fiche produit** — le mode d'emploi de l'écran le plus ouvert du
 * référentiel.
 *
 * Elle vient après le paramétrage produit, et pas avant : une fiche ne fait que
 * citer un vocabulaire écrit ailleurs, et l'expliquer en premier obligerait à
 * renvoyer à chaque paragraphe vers des référentiels qu'on n'a pas encore lus.
 *
 * Son cœur est la distinction entre les trois « portes » (cf.
 * {@link ProductGatesDiagram}). L'écran les rend visuellement semblables — une
 * barre qui verdit, un bloc qui se signe, un bouton qui publie — et deux
 * d'entre elles n'empêchent rien. Sans cette page, le refus de publication se
 * cherche du côté de la barre de complétude, où il n'est pas.
 */
@Component({
  selector: 'app-doc-product-sheet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    ProductGatesDiagram,
  ],
  templateUrl: './product-sheet-page.html',
  styleUrl: '../../doc-page.scss',
})
export class DocProductSheetPage {}
