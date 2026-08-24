import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldButtonComponent, FoldPageLayoutComponent, FoldPanelHostService } from 'fold-ng';

import { LocationFormPanel } from './location-form-panel/location-form-panel';
import { LocationList } from './location-list/location-list';

/**
 * Admin **Locations** — les boutiques et leurs modes de vente. Page-coquille :
 * elle pose le chrome, l'action « Nouvel location » (side-panel de création)
 * et compose la liste des boutiques ({@link LocationList}). Création, édition
 * et suppression passent toutes par le side-panel ({@link LocationFormPanel}).
 */
@Component({
  selector: 'app-locations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, LocationList],
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
