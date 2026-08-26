import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldButtonComponent, FoldPageLayoutComponent, FoldPanelHostService } from 'fold-ng';

import { PointOfSaleList } from './point-of-sale-list/point-of-sale-list';
import { PointOfSalePanel } from './point-of-sale-panel/point-of-sale-panel';

/**
 * Admin **Points de vente** — d'où l'on vend. Page-coquille : elle pose le
 * chrome, l'action « Nouveau point de vente » et compose la liste
 * ({@link PointOfSaleList}).
 *
 * L'écran s'appelait « Emplacements » et ne montrait que les boutiques. La
 * plateforme professionnelle existait pourtant : elle se lisait comme un `NULL`
 * dans la matrice de canaux, donc nulle part (p-0,
 * `documentation/pim/point-de-vente.md`).
 *
 * Ouverture, réglage et suppression passent tous par le même side-panel
 * ({@link PointOfSalePanel}) — la suppression y vit dans sa zone dangereuse,
 * plus dans un menu de carte.
 */
@Component({
  selector: 'app-points-of-sale-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, PointOfSaleList],
  templateUrl: './points-of-sale-page.html',
})
export class PointsOfSalePage {
  private readonly panelHost = inject(FoldPanelHostService);

  /** Ouvre le side-panel de création ; la liste, réactive à la DB, se met à
   *  jour toute seule quand une boutique en sort. */
  protected openCreate(): void {
    this.panelHost.open<boolean>(PointOfSalePanel, { side: 'right' });
  }
}
