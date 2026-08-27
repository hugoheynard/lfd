import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

/** Les deux façons d'être servi. Le reste du parcours en découle. */
export type ServiceMode = 'pickup' | 'delivery';

/**
 * Une des deux portes de la commande : le retrait ou le coursier.
 *
 * Le mode est NOMMÉ DEUX FOIS, et c'est voulu : la pastille porte le mot du
 * fournil — celui qui figure sur le bon de commande — et le titre porte celui du
 * client. La même carte parle donc aux deux, sans qu'aucun des deux ait à
 * apprendre le vocabulaire de l'autre.
 */
@Component({
  selector: 'app-mode-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  host: { '[attr.data-mode]': 'mode()' },
  templateUrl: './mode-card.html',
  styleUrl: './mode-card.scss',
})
export class ModeCard {
  readonly mode = input.required<ServiceMode>();

  /** Le mot du fournil, dans la pastille. */
  readonly badge = input.required<string>();

  /** Le mot du client, sur la photo. Deux lignes séparées par un retour. */
  readonly title = input.required<string>();

  /** Où, et à partir de quand. */
  readonly detail = input.required<string>();

  /** Le délai ou l'échéance — ce qui décide vraiment du choix. */
  readonly note = input.required<string>();

  readonly chosen = output<void>();
}
