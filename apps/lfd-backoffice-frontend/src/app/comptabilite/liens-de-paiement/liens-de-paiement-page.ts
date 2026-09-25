import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { FreeLinks } from './free-links/free-links';
import { OrdersToSettle } from './orders-to-settle/orders-to-settle';

/** Les deux sujets de l'écran. */
export type PaymentLinksTab = 'orders' | 'free';

const TABS: readonly FoldTabItem<PaymentLinksTab>[] = [
  { key: 'orders', label: 'Commandes à régler', icon: 'receipt' },
  { key: 'free', label: 'Liens libres', icon: 'credit-card' },
];

/**
 * **Comptabilité › Liens de paiement** — faire régler un client par carte :
 * soit une commande restée impayée, soit une somme demandée hors commande.
 *
 * Les deux onglets ne partagent rien que leur geste final (un lien à copier) ;
 * chacun charge ce qu'il montre, à l'ouverture.
 *
 * Plan : `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §2.
 */
@Component({
  selector: 'app-liens-de-paiement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldNavLayoutComponent,
    FoldPageLayoutComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
    FreeLinks,
    OrdersToSettle,
  ],
  templateUrl: './liens-de-paiement-page.html',
})
export class LiensDePaiementPage {
  protected readonly tabs = TABS;
  protected readonly tab = signal<PaymentLinksTab>('orders');
}
