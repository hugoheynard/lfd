import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldCardComponent, FoldIconComponent } from 'fold-ng';

/**
 * Encart **référence client** — en tête du dossier société. La référence
 * `C-XXXXXX` est courte et sans caractères ambigus : elle se **dicte au
 * téléphone**. Présentation pure ; le libellé et la note (formulés par app)
 * arrivent en `input()`.
 */
@Component({
  selector: 'lfd-company-reference-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldIconComponent],
  templateUrl: './company-reference-card.html',
  styleUrl: './company-reference-card.scss',
})
export class CompanyReferenceCard {
  /** La référence à afficher (`C-XXXXXX`). */
  readonly reference = input.required<string>();
  /** Libellé au-dessus de la valeur. */
  readonly label = input('Référence client');
  /** Note explicative sous le libellé ; vide = masquée. */
  readonly note = input('');
}
