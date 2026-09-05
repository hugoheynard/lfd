import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { formatCents } from '../../format-money';
import { ClientCart } from '../client-cart.service';
import { ClientDialog } from '../../dialog/client-dialog';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { CartSummary } from '../cart-summary/cart-summary';

/**
 * **Le panier, en tiroir** — le détail, à la demande.
 *
 * Il tenait une colonne permanente de 360 px sur la boutique. Ce qu'on y
 * regarde vraiment en parcourant le rayon tient en trois nombres — combien de
 * pièces, combien ça fait, où c'est servi — et ces trois-là sont désormais dans
 * le bandeau. Le reste est du DÉTAIL : les lignes, les taux, la remise. On
 * l'ouvre quand on veut relire, et la vitrine récupère la largeur entretemps.
 *
 * `placement="side"` : un tiroir amarré à droite au bureau, une feuille montante
 * en pile — c'est le même composant qui décide, et donc un seul état d'ouverture.
 */
@Component({
  selector: 'app-cart-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CartSummary, ClientDialog],
  templateUrl: './cart-panel.html',
  styleUrl: './cart-panel.scss',
})
export class CartPanel {
  readonly open = input.required<boolean>();

  readonly closed = output<void>();
  /** Régler — l'écran décide de ce que ça veut dire, pas le tiroir. */
  readonly paid = output<void>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);

  protected readonly payLabel = computed(() =>
    fill(this.t().cart.pay, { total: formatCents(this.cart.totals().totalCents) }),
  );
}
