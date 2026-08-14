import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldButtonComponent, FoldCardComponent, FoldIconComponent } from 'fold-ng';

import type { PendingAccess } from '../pending-access.model';

/** Une ligne prête à rendre — nom et attente calculés une fois, en amont. */
export interface PendingRow {
  readonly person: PendingAccess;
  readonly name: string;
  readonly waiting: string;
}

/**
 * Une personne de la file, et le seul geste qu'on ait sur elle : lui refabriquer
 * un lien.
 *
 * Sorti de la page parce que c'est là que vit tout le dessin — la carte, la
 * bascule mobile du libellé, l'alignement de l'icône. La page, elle, n'a plus à
 * connaître que l'ordre et le vide.
 */
@Component({
  selector: 'app-pending-access-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldCardComponent, FoldButtonComponent, FoldIconComponent],
  templateUrl: './pending-access-row.html',
  styleUrl: './pending-access-row.scss',
})
export class PendingAccessRowComponent {
  readonly row = input.required<PendingRow>();
  /** Un lien est en cours de fabrication ailleurs — deux clics, deux liens. */
  readonly busy = input(false);

  readonly copy = output<void>();
}
