import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * La barre du panier, en pile — ce que le bureau montre dans sa colonne.
 *
 * Elle est COLLANTE au bas de l'écran : ce qu'on a déjà pris ne doit pas se
 * mériter un défilement. Elle porte le nombre de pièces, le lieu, le montant, et
 * elle mène au panier — un seul geste, pas un menu.
 */
@Component({
  selector: 'app-cart-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-bar.html',
  styleUrl: './cart-bar.scss',
})
export class CartBar {
  readonly label = input.required<string>();

  /** Le rappel du service — vide quand il n'y a rien à rappeler. */
  readonly where = input('');

  readonly total = input.required<string>();

  readonly opened = output<void>();
}
