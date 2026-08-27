import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FoldSurfaceDirective } from 'fold-ng';

import { ClientCopyService } from '../copy/client-copy.service';
import { LangSwitch } from '../lang-switch/lang-switch';

/**
 * Le châssis d'un écran client : l'accroche sur l'encre, la feuille crème
 * dessous.
 *
 * En pile, les deux s'enchaînent — l'accroche part la première au défilement,
 * la lèvre amarre le bord arrondi de la feuille sous la barre, et l'encre reste
 * visible dans les deux angles. Au-delà du pli, ils deviennent deux colonnes :
 * la marque et l'argument à gauche, le contenu à droite.
 *
 * C'est la SEULE chose que les écrans clients partagent physiquement, et ils la
 * partagent tous. Le contenu de l'étage arrive par projection ; ce qui se pose
 * au bas de la colonne d'encre (des preuves, une adresse) passe par
 * `[aside-foot]`.
 */
@Component({
  selector: 'app-client-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSurfaceDirective, LangSwitch],
  templateUrl: './client-page.html',
  styleUrl: './client-page.scss',
})
export class ClientPage {
  /** Le titre d'accroche, sur l'encre. */
  readonly heading = input.required<string>();

  /** La ligne qui le suit. */
  readonly intro = input.required<string>();

  /** Le cran haut du titre — réservé à l'écran d'entrée, le plus long. */
  readonly big = input(false);

  protected readonly t = inject(ClientCopyService).t;
}
