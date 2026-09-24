import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent } from 'fold-ng';

import { ClientCopyService } from '../../../copy/client-copy.service';
import {
  type ShelfBandSize,
  type ShelfFeature,
  type ShelfFeatureFormat,
} from '../../mock-shelf-feature';

/**
 * **La tuile d'opération**, en première case de la grille — le rayon de Noël
 * au milieu des pièces, sur fond encre ; ou **la bande** de Pâques, pleine
 * largeur sur fond encre bleue (cf. {@link ShelfFeatureFormat}).
 *
 * Elle n'est PAS une carte interactive : la maquette rend la tuile entière
 * cliquable, mais une opération sans rayon n'a rien à ouvrir, et une carte
 * `role="button"` qui ne mène nulle part mentirait. L'action est donc le seul
 * bouton, et il n'existe que si le rayon existe.
 */
@Component({
  selector: 'app-shelf-feature-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent],
  host: {
    '[class.block]': 'format() === "block"',
    '[class.band]': 'format() === "band"',
    '[class.double]': 'format() === "band" && bandSize() === "double"',
  },
  templateUrl: './shelf-feature-tile.html',
  styleUrl: './shelf-feature-tile.scss',
})
export class ShelfFeatureTile {
  readonly feature = input.required<ShelfFeature>();
  readonly format = input<ShelfFeatureFormat>('wide');
  /** La hauteur de la bande — ignorée pour les autres formats. */
  readonly bandSize = input<ShelfBandSize>('simple');

  /** Le rayon à ouvrir. */
  readonly opened = output<string>();

  protected readonly t = inject(ClientCopyService).t;
}
