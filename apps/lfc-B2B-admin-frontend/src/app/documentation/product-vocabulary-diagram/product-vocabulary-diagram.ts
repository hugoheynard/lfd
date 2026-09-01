import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « comment le vocabulaire se mappe » — de l'appellation à la fiche
 * réglementaire, et les deux entrées d'un allergène.
 *
 * Sa moitié basse est la raison d'être du schéma. La liste d'allergènes d'un
 * INGRÉDIENT et celle d'une DÉCLINAISON portent le même genre de codes, et
 * pourtant leur liste vide dit le contraire l'une de l'autre : sur la matière,
 * elle veut dire « personne n'a saisi » ; sur l'étiquette, elle AFFIRME
 * « aucun allergène ». Confondre les deux ferait imprimer une allégation que
 * personne n'a prononcée.
 *
 * D'où le lien interrompu entre les deux : l'ensemble dérivé propose l'écart,
 * il ne l'écrit pas. Une étiquette déjà servie ne se réécrit pas parce qu'on
 * vient d'enrichir un ingrédient.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-product-vocabulary-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-vocabulary-diagram.html',
  styleUrl: './product-vocabulary-diagram.scss',
})
export class ProductVocabularyDiagram {}
