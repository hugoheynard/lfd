import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { ProductVocabularyDiagram } from '../../product-vocabulary-diagram/product-vocabulary-diagram';

/**
 * **Paramétrage produit** — les trois référentiels qu'une fiche cite, et le
 * quatrième qui n'est pas encore écrit.
 *
 * La page existe pour une confusion précise : « paramétrage produit » et
 * « fiche produit » se ressemblent au point qu'on cherche l'un dans l'autre.
 * Elle les sépare par ce qui les sépare vraiment — la PORTÉE d'un changement,
 * une fiche contre toutes celles qui citent — et pas par une liste d'écrans.
 *
 * Le reste tient à un piège du modèle qu'aucun écran ne peut signaler seul : la
 * liste d'allergènes VIDE affirme « aucun allergène » sur une déclinaison et
 * n'affirme rien sur un ingrédient. Le schéma le montre côte à côte
 * (cf. {@link ProductVocabularyDiagram}) parce que c'est en les voyant séparés,
 * un écran chacun, qu'on les confond.
 */
@Component({
  selector: 'app-doc-product-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    ProductVocabularyDiagram,
  ],
  templateUrl: './product-settings-page.html',
  styleUrl: '../../doc-page.scss',
})
export class DocProductSettingsPage {}
