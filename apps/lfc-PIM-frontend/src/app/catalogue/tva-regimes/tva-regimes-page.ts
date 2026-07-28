import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldPageLayoutComponent } from 'fold-ng';

import { TvaRegimePlatformUsages } from './tva-regime-platform-usages/tva-regime-platform-usages';
import { TvaRegimeTable } from './tva-regime-table/tva-regime-table';

/**
 * Régimes de TVA = collections Famille A (le doc : `tva-5-5`, `tva-10`,
 * `tva-20`). Page-coquille : elle pose le chrome et compose deux briques — la
 * gestion des régimes ({@link TvaRegimeTable}) puis leurs usages plateforme
 * ({@link TvaRegimePlatformUsages}, la réconciliation Shopify).
 */
@Component({
  selector: 'app-tva-regimes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, TvaRegimeTable, TvaRegimePlatformUsages],
  templateUrl: './tva-regimes-page.html',
})
export class TvaRegimesPage {}
