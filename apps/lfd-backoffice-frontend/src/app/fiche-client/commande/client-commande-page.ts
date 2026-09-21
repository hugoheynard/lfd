import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { OrderViewComponent } from '../../commandes/order-view/order-view';

/**
 * **Une commande, DANS l'espace de son compte.**
 *
 * 🔴 Elle s'ouvrait jusqu'au 2026-09-13 sur la route de premier niveau
 * `/commandes/:id`, qui vit hors de la coquille : depuis l'onglet Commandes
 * d'un client, cliquer une ligne faisait donc disparaître le bandeau du compte
 * et ses onglets. On ne quittait pas seulement un écran, on quittait le
 * dossier — et le seul retour était « Comptes clients », c'est-à-dire tout en
 * haut, alors qu'on était en train de parcourir les commandes d'UN client.
 *
 * La route de premier niveau demeure, et il le faut : une commande « zéro
 * friction » n'a pas d'entreprise, donc pas de fiche où la loger. Ces deux
 * écrans partagent leur corps (`app-order-view`) et ne diffèrent que par ce qui
 * les entoure — ici, rien : le bandeau et les onglets appartiennent à la
 * coquille, et seul manque le chemin de retour vers la liste dont on vient.
 */
@Component({
  selector: 'app-client-commande-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, OrderViewComponent, RouterLink],
  templateUrl: './client-commande-page.html',
  styleUrl: './client-commande-page.scss',
})
export class ClientCommandePage {
  /** La société, liée depuis le segment PARENT — c'est le dossier ouvert. */
  readonly id = input.required<string>();

  /**
   * La commande. Nommée `orderId` et non `id` : sous la coquille, `:id` désigne
   * déjà la société, et deux segments homonymes se seraient écrasés.
   */
  readonly orderId = input.required<string>();
}
