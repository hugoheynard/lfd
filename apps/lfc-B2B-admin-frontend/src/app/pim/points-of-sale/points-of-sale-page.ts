import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldButtonComponent, FoldPageLayoutComponent, FoldPanelHostService } from 'fold-ng';

import { PlatformList } from './platform-list/platform-list';
import { ShopFormPanel } from './shop-form-panel/shop-form-panel';
import { ShopList } from './shop-list/shop-list';

/**
 * Admin **Points de vente** — d'où l'on vend. Page-coquille : elle pose le
 * chrome, l'action « Nouvelle boutique » (side-panel de création) et compose
 * les deux genres de point de vente — les boutiques ({@link ShopList}),
 * qui s'éditent, et les plateformes ({@link PlatformList}), qui ne s'éditent
 * pas.
 *
 * L'écran s'appelait « Emplacements » et ne montrait que les premières. La
 * plateforme professionnelle existait pourtant : elle se lisait comme un `NULL`
 * dans la matrice de canaux, donc nulle part (p-0,
 * `documentation/pim/point-de-vente.md`).
 *
 * Création, édition et suppression d'une boutique passent toutes par le
 * side-panel ({@link ShopFormPanel}).
 */
@Component({
  selector: 'app-points-of-sale-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, ShopList, PlatformList],
  templateUrl: './points-of-sale-page.html',
})
export class PointsOfSalePage {
  private readonly panelHost = inject(FoldPanelHostService);

  /** Ouvre le side-panel de création ; la liste, réactive à la DB, se met à
   *  jour toute seule quand une boutique en sort. */
  protected openCreate(): void {
    this.panelHost.open<boolean>(ShopFormPanel, { side: 'right' });
  }
}
