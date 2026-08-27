import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ClientCopyService } from '../../client/copy/client-copy.service';
import { storyOf } from '../../client/mock-rayon-stories';
import { packshotOf } from '../../client/mock-shop';

/**
 * L'invitation à en savoir plus sur le rayon qu'on regarde.
 *
 * Elle change de forme avec le pli sans changer de rôle : une bande de 62 px
 * au-dessus de la grille en pile, une carte de 104 px sous la liste des rayons
 * au bureau. Le voile suit — latéral quand le texte est à gauche, descendant
 * quand il s'assoit dans le bas de l'image.
 */
@Component({
  selector: 'app-shelf-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shelf-banner.html',
  styleUrl: './shelf-banner.scss',
})
export class ShelfBanner {
  /** Le rayon filtré — « Tout » compris, qui parle de la maison. */
  readonly shelf = input.required<string>();

  readonly opened = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly story = computed(() => storyOf(this.shelf()));
  protected readonly image = computed(() => packshotOf(this.shelf()));
}
