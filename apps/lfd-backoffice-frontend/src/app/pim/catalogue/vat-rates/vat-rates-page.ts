import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
} from '@angular/core';

import { FoldButtonComponent, FoldPageLayoutComponent, FoldPanelHostService } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { VatRateFormPanel } from './vat-rate-form-panel/vat-rate-form-panel';
import { VatRateTable } from './vat-rate-table/vat-rate-table';

/**
 * Taux de TVA — le **référentiel fiscal** du catalogue. Page-coquille : le
 * chrome, l'action « Ajouter un taux de TVA » (side-panel), et le tableau.
 *
 * L'écran disait « taux » ; le mot est celui du modèle, pas celui du métier.
 * Ce qu'un comptable ajoute, c'est un TAUX. Le code garde `rate` — l'agrégat
 * n'a pas changé de nature.
 *
 * Elle portait aussi une section « Usages plateforme » qui inspectait Shopify et
 * y poussait les collections `tva-*`. Ce n'était pas un usage mais un **envoi**,
 * et il est parti dans Publication → Shopify, où vivent les canaux. Restait ici
 * le seul usage qui regarde vers l'intérieur : combien de familles visent le
 * taux — la colonne « Utilisé par », qui dit avant la suppression ce que la
 * base refuserait après.
 */

@Component({
  selector: 'app-vat-rates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, VatRateTable],
  templateUrl: './vat-rates-page.html',
  styleUrl: './vat-rates-page.scss',
  // Encapsulation désactivée pour une seule règle : garder le CTA sur la ligne
  // du titre en mobile suppose de contredire `.page-head`, qui vit dans le
  // gabarit de `fold-page-layout`. Tout est porté sous le sélecteur d'hôte, donc
  // la portée reste celle de cette page.
  encapsulation: ViewEncapsulation.None,
})
export class VatRatesPage {
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  /**
   * Poser un taux est un droit à part (`tax:write`, la comptabilité l'a).
   * Le front cache, le serveur refuse : ce test évite d'offrir un bouton qui
   * répondrait 403, il ne protège rien.
   */
  protected readonly canWrite = computed(() => this.permissions.can('pim_tax:write'));

  /** Ouvre le side-panel de création ; le tableau, réactif à la DB, se met à
   *  jour tout seul quand un taux en sort. */
  protected openCreate(): void {
    this.panelHost.open<boolean>(VatRateFormPanel, { side: 'right' });
  }
}
