import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';

import { FoldButtonComponent, FoldPageLayoutComponent, FoldPanelHostService } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { formatPercent } from '../../data/channels';
import { ArchivedList, type ArchivedEntry } from '../../shared/archived-list/archived-list';
import { VatRateStore } from './vat-store';
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
 * Elle portait aussi une section « Usages plateforme » qui inspectait l'ancien canal de vente en ligne et
 * y poussait les collections `tva-*`. Ce n'était pas un usage mais un **envoi**,
 * et il est parti dans Publication, où vivent les canaux. Restait ici
 * le seul usage qui regarde vers l'intérieur : combien de familles visent le
 * taux — la colonne « Utilisé par », qui dit avant l'archive ce que le
 * référentiel refuserait après. Les taux archivés sont repliés sous le
 * tableau, avec « Restaurer ».
 */

@Component({
  selector: 'app-vat-rates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, VatRateTable, ArchivedList],
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
  private readonly store = inject(VatRateStore);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);

  /** Les taux archivés, à part : ils ne se proposent plus, et reviennent d'ici. */
  protected readonly archived = computed<readonly ArchivedEntry[]>(() =>
    this.store.archivedItems().map((rate) => ({
      key: rate.id,
      label: rate.name,
      detail: formatPercent(rate.percent),
    })),
  );

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

  protected async restore(id: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.restore(id);
    } catch (caught) {
      this.notify.refused(caught, 'Restauration refusée.');
    } finally {
      this.busy.set(false);
    }
  }
}
