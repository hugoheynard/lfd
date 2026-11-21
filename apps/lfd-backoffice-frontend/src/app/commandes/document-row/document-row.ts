import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldIconComponent, type FoldIconName } from 'fold-ng';

/**
 * **Une ligne de l'onglet « Documents »** — le même modèle pour une pièce, un
 * e-mail, les CGV ou la preuve : icône, titre, ligne discrète (date ou état),
 * actions à droite, et ce qui la précise dessous (un avertissement, des images).
 *
 * Le titre peut être projeté (`[rowTitle]`, un lien) à la place de `title`.
 */
@Component({
  selector: 'app-document-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './document-row.html',
  styleUrl: './document-row.scss',
})
export class DocumentRow {
  readonly icon = input.required<FoldIconName>();
  readonly title = input('');
  readonly meta = input<string | null>(null);
}
