import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';

/**
 * « Nouvelle commande » — l'action du bandeau.
 *
 * Elle vivait dans l'accueil, écrite dans son gabarit et habillée par sa feuille
 * de style. Le deuxième écran qui la porte l'a fait sortir : un bouton dont
 * l'accent, la hauteur et les deux registres de texte sont réglés au pixel ne
 * peut pas être recopié — la deuxième copie diverge à la première retouche.
 *
 * Elle est projetée DANS le bandeau, qui est lui-même dans la bande du shell :
 * d'où le composant plutôt qu'un simple bloc de style partagé. Un vrai élément
 * porte sa propre encapsulation et ne dépend plus de qui le déclare.
 */
@Component({
  selector: 'app-new-order-action',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, RouterLink],
  templateUrl: './new-order-action.html',
  styleUrl: './new-order-action.scss',
})
export class NewOrderAction {
  protected readonly t = inject(ClientCopyService).t;
}
