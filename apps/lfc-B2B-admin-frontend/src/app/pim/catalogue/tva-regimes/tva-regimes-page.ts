import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldButtonComponent, FoldPageLayoutComponent, FoldPanelHostService } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { TvaRegimeFormPanel } from './tva-regime-form-panel/tva-regime-form-panel';
import { TvaRegimeTable } from './tva-regime-table/tva-regime-table';

/**
 * Régimes de TVA — le **référentiel fiscal** du catalogue. Page-coquille : le
 * chrome, l'action « Nouveau régime » (side-panel), et le tableau.
 *
 * Elle portait aussi une section « Usages plateforme » qui inspectait Shopify et
 * y poussait les collections `tva-*`. Ce n'était pas un usage mais un **envoi**,
 * et il est parti dans Publication → Shopify, où vivent les canaux. Restait ici
 * le seul usage qui regarde vers l'intérieur : combien de familles visent le
 * régime — la colonne « Utilisé par », qui dit avant la suppression ce que la
 * base refuserait après.
 */

@Component({
  selector: 'app-tva-regimes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, TvaRegimeTable],
  templateUrl: './tva-regimes-page.html',
})
export class TvaRegimesPage {
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  /**
   * Poser un taux est un droit à part (`tax:write`, la comptabilité l'a).
   * Le front cache, le serveur refuse : ce test évite d'offrir un bouton qui
   * répondrait 403, il ne protège rien.
   */
  protected readonly canWrite = computed(() => this.permissions.can('tax:write'));

  /** Ouvre le side-panel de création ; le tableau, réactif à la DB, se met à
   *  jour tout seul quand un régime en sort. */
  protected openCreate(): void {
    this.panelHost.open<boolean>(TvaRegimeFormPanel, { side: 'right' });
  }
}
