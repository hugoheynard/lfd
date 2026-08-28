import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';

/**
 * « Mes données » — deux moitiés, et la seconde a son propre territoire.
 *
 * À gauche les EXPORTS, des lignes ordinaires. À droite la ZONE SENSIBLE, dans
 * un encadré à part : deux gestes irréversibles — transférer l'entreprise,
 * fermer l'espace — chacun avec sa conséquence ÉNUMÉRÉE avant son bouton.
 *
 * Les deux boutons sont bordés, jamais un aplat rouge : l'action est offerte,
 * jamais encouragée. Et le libellé dit « cet espace », jamais « mon compte » —
 * un utilisateur peut en détenir deux, et fermer l'un ne touche pas l'autre.
 */
@Component({
  selector: 'app-data-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './data-card.html',
  styleUrl: './data-card.scss',
})
export class DataCard {
  protected readonly t = inject(ClientCopyService).t;
}
