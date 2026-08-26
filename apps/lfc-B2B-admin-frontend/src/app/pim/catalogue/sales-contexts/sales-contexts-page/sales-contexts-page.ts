import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { SalesContextAdminView } from '@lfd/pim-contracts';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldPageLayoutComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { SalesContextAdminStore } from '../sales-context-admin.store';

/**
 * **Contextes de vente** — le registre qui décide de ce qu'on peut vendre.
 *
 * Il n'avait aucun écran, et c'est précisément ce qui a laissé sa colonne
 * `channel_key` devenir une identité sans que personne ne le remarque : une
 * donnée qu'on ne peut pas voir n'est pas pilotable.
 *
 * **En lecture.** Un contexte se pose par migration — l'ouvrir à un formulaire
 * rendrait possible d'en inventer un que ni la facturation ni Shopify ne savent
 * traiter. L'écran montre ce qui existe, ce que chacun implique, et lequel est
 * la racine.
 */
@Component({
  selector: 'app-sales-contexts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldDataTableComponent,
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldButtonComponent,
  ],
  templateUrl: './sales-contexts-page.html',
  styleUrl: './sales-contexts-page.scss',
})
export class SalesContextsPage {
  private readonly store = inject(SalesContextAdminStore);

  protected readonly contexts = this.store.items;
  protected readonly loadError = this.store.loadError;

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'label', label: 'Contexte' },
    { key: 'scope', label: 'Vendu depuis', width: '14rem' },
    { key: 'shopify', label: 'Shopify', width: '10rem' },
    { key: 'state', label: 'État', width: '9rem' },
  ];

  protected readonly rowKey = (row: SalesContextAdminView): string => row.key;

  /**
   * « 2 points de vente » — ou rien pour un contexte global. Le zéro d'un
   * contexte sans lieu n'est pas un manque : la question ne se pose pas pour
   * lui, et l'afficher ferait croire qu'il attend qu'on l'y rattache.
   */
  protected scopeLabel(context: SalesContextAdminView): string {
    if (!context.perLocation) {
      return 'Partout — aucun lieu requis';
    }
    const count = context.offeredByLocations;
    return count === 0 ? 'Aucun point de vente' : `${count} point(s) de vente`;
  }

  protected readonly rootCount = computed(
    () => this.contexts().filter((context) => context.root).length,
  );

  protected retry(): void {
    void this.store.reload().catch(() => undefined);
  }
}
