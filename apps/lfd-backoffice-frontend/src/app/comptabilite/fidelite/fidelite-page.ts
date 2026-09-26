import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { LoyaltyBalances } from './loyalty-balances/loyalty-balances';
import { LoyaltySettings } from './loyalty-settings/loyalty-settings';
import { LoyaltyVouchers } from './loyalty-vouchers/loyalty-vouchers';

/** Les trois sujets de l'écran. */
export type LoyaltyTab = 'settings' | 'balances' | 'vouchers';

const TABS: readonly FoldTabItem<LoyaltyTab>[] = [
  { key: 'settings', label: 'Réglage', icon: 'sliders' },
  { key: 'balances', label: 'Soldes', icon: 'coins' },
  { key: 'vouchers', label: "Bons d'achat", icon: 'gift' },
];

/**
 * **Comptabilité › Fidélité** — le réglage du programme de points, les soldes
 * par titulaire et les bons d'achat émis.
 *
 * Chaque onglet charge ce qu'il montre, à l'ouverture : un solde relu après
 * l'annulation d'un bon est donc à jour sans qu'un onglet prévienne l'autre.
 *
 * Plan : `documentation/comptabilite/plan-points-de-fidelite.md`, lot B.
 */
@Component({
  selector: 'app-fidelite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldNavLayoutComponent,
    FoldPageLayoutComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
    LoyaltyBalances,
    LoyaltySettings,
    LoyaltyVouchers,
  ],
  templateUrl: './fidelite-page.html',
})
export class FidelitePage {
  protected readonly tabs = TABS;
  protected readonly tab = signal<LoyaltyTab>('settings');
}
