import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldBadgeComponent } from 'fold-ng';

/**
 * **La place d'un dépôt** : pendant un glisser, là où le bloc tombera — un
 * liseré à la couleur d'accent et sa pastille « Insérer ici », au-dessus de
 * l'aperçu du bloc projeté, atténué et cerné de pointillés (précision de
 * Hugo du 2026-11-08 : « on le voit en preview entre les éléments »). Elle
 * sert de `cdkDragPlaceholder` aux deux glissers du canevas — une carte de la
 * bibliothèque (son esquisse), un bloc qu'on déplace (son propre rendu) —
 * pour qu'ils parlent le même langage. Purement visuelle : l'insertion est
 * annoncée par le canevas.
 */
@Component({
  selector: 'app-mail-insert-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './mail-insert-bar.html',
  styleUrl: './mail-insert-bar.scss',
  host: {
    'aria-hidden': 'true',
    'data-insert-bar': '',
    '[class.full-width]': 'fullWidth()',
  },
})
export class MailInsertBar {
  /** Le bloc projeté est une image pleine largeur : sa place va, elle aussi, d'un bord à l'autre. */
  readonly fullWidth = input(false);
}
