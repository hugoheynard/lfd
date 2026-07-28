import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldButtonComponent, FoldPageLayoutComponent, FoldPanelHostService } from 'fold-ng';

import { EmplacementFormPanel } from './emplacement-form-panel/emplacement-form-panel';
import { EmplacementList } from './emplacement-list/emplacement-list';

/**
 * Admin **Emplacements** — les boutiques et leurs modes de vente. Page-coquille :
 * elle pose le chrome, l'action « Nouvel emplacement » (side-panel de création)
 * et compose la liste des boutiques ({@link EmplacementList}). Création, édition
 * et suppression passent toutes par le side-panel ({@link EmplacementFormPanel}).
 */
@Component({
  selector: 'app-emplacements-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, EmplacementList],
  templateUrl: './emplacements-page.html',
})
export class EmplacementsPage {
  private readonly panelHost = inject(FoldPanelHostService);

  /** Ouvre le side-panel de création ; la liste, réactive à la DB, se met à
   *  jour toute seule quand une boutique en sort. */
  protected openCreate(): void {
    this.panelHost.open<boolean>(EmplacementFormPanel, { side: 'right' });
  }
}
