import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { TvaRegimeFormPanel } from './tva-regime-form-panel/tva-regime-form-panel';
import { TvaRegimePlatformUsages } from './tva-regime-platform-usages/tva-regime-platform-usages';
import { TvaRegimeTable } from './tva-regime-table/tva-regime-table';

/**
 * Régimes de TVA = collections Famille A (le doc : `tva-5-5`, `tva-10`,
 * `tva-20`). Page-coquille : elle pose le chrome, l'action « Nouveau régime »
 * (side-panel de création) et compose deux briques — la gestion des régimes
 * ({@link TvaRegimeTable}) puis leurs usages plateforme
 * ({@link TvaRegimePlatformUsages}, la réconciliation Shopify).
 */
@Component({
  selector: 'app-tva-regimes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldButtonComponent,
    TvaRegimeTable,
    TvaRegimePlatformUsages,
  ],
  templateUrl: './tva-regimes-page.html',
})
export class TvaRegimesPage {
  private readonly panelHost = inject(FoldPanelHostService);

  /** Ouvre le side-panel de création ; le tableau, réactif à la DB, se met à
   *  jour tout seul quand un régime en sort. */
  protected openCreate(): void {
    this.panelHost.open<boolean>(TvaRegimeFormPanel, { side: 'right' });
  }
}
