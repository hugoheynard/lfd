import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldButtonComponent, FoldPageLayoutComponent, FoldPanelHostService } from 'fold-ng';

import { PlatformList } from '../points-of-sale/platform-list/platform-list';
import { LocationFormPanel } from './location-form-panel/location-form-panel';
import { LocationList } from './location-list/location-list';

/**
 * Admin **Points de vente** — d'où l'on vend. Page-coquille : elle pose le
 * chrome, l'action « Nouvelle boutique » (side-panel de création) et compose
 * les deux genres de point de vente — les boutiques ({@link LocationList}),
 * qui s'éditent, et les plateformes ({@link PlatformList}), qui ne s'éditent
 * pas.
 *
 * L'écran s'appelait « Emplacements » et ne montrait que les premières. La
 * plateforme professionnelle existait pourtant : elle se lisait comme un `NULL`
 * dans la matrice de canaux, donc nulle part (p-0,
 * `documentation/pim/point-de-vente.md`).
 *
 * Création, édition et suppression d'une boutique passent toutes par le
 * side-panel ({@link LocationFormPanel}).
 */
@Component({
  selector: 'app-locations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, LocationList, PlatformList],
  templateUrl: './locations-page.html',
})
export class LocationsPage {
  private readonly panelHost = inject(FoldPanelHostService);

  /** Ouvre le side-panel de création ; la liste, réactive à la DB, se met à
   *  jour toute seule quand une boutique en sort. */
  protected openCreate(): void {
    this.panelHost.open<boolean>(LocationFormPanel, { side: 'right' });
  }
}
