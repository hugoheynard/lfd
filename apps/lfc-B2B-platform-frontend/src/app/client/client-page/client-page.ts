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
 *
 * Au-delà du pli, deux gabarits. `split` met l'argument à gauche et le contenu
 * à droite — c'est l'écran qui doit convaincre. `stacked` étale l'accroche sur
 * toute la largeur, en dégradé jusqu'au puits, et laisse le contenu occuper la
 * page — c'est l'écran qui doit faire CHOISIR. Le handoff le dit en toutes
 * lettres : le bureau ne déplie pas la pile, il met les décisions côte à côte.
 */
@Component({
  selector: 'app-client-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-layout]': 'layout()' },
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

  /**
   * Au-delà du pli, la colonne de contenu se CENTRE dans sa moitié plutôt que de
   * se ranger à gauche. C'est une entrée et pas une règle générale : l'écran
   * d'entrée aligne sa feuille sur la colonne d'argument d'en face, alors qu'un
   * écran qui n'a plus rien à argumenter n'a plus rien à aligner.
   */
  readonly centred = input(false);

  /** Le gabarit de bureau. En pile, les deux se ressemblent. */
  readonly layout = input<'split' | 'stacked'>('split');

  /**
   * Le sur-titre au-dessus de l'accroche — gabarit `stacked` seulement. En pile,
   * c'est la barre du shell qui le porte, et le répéter ferait doublon.
   */
  readonly kicker = input<string | null>(null);

  /**
   * L'intro de bureau, quand elle diffère de celle du téléphone. Les deux vivent
   * dans le DOM et c'est le CSS qui choisit : le pli est une affaire de largeur,
   * et le rendu serveur ne la connaît pas.
   */
  readonly introWide = input<string | null>(null);

  protected readonly t = inject(ClientCopyService).t;
}
