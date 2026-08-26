import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { SalesContextAdminView } from '@lfd/pim-contracts';

import {
  FoldIconComponent,
  FoldPanelHostService,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowCardDirective,
  FoldEmptyStateComponent,
  FoldPageLayoutComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { SalesContextAdminStore } from '../sales-context-admin.store';
import { SalesContextPanel } from '../sales-context-panel/sales-context-panel';

/**
 * **Contextes de vente** — le registre qui décide de ce qu'on peut vendre.
 *
 * Il n'avait aucun écran, et c'est précisément ce qui a laissé sa colonne
 * `channel_key` devenir une identité sans que personne ne le remarque : une
 * donnée qu'on ne peut pas voir n'est pas pilotable.
 *
 * **L'écriture est réservée à l'administrateur** (`catalog:write`, le seul droit
 * qu'il porte seul). Les autres rôles lisent : le bouton d'ouverture et la
 * colonne d'actions n'apparaissent pas pour eux. Le front cache, le serveur
 * refuse — le second protège, le premier évite d'offrir un geste qui répondrait
 * 403.
 */
@Component({
  selector: 'app-sales-contexts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldDataTableComponent,
    // Sans elle, `foldCell` n'est qu'un attribut inerte sur un `ng-template` :
    // Angular ne s'en plaint pas, le build reste vert, et les lignes rendent le
    // vide. Le tableau des taux porte le même avertissement — je l'ai lu après.
    FoldDataTableCellDirective,
    // Même piège pour la carte mobile : sans cette directive, `foldRowCard`
    // reste inerte et le téléphone affiche le vide.
    FoldDataTableRowCardDirective,
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldButtonComponent,
    FoldIconComponent,
  ],
  templateUrl: './sales-contexts-page.html',
  styleUrl: './sales-contexts-page.scss',
})
export class SalesContextsPage {
  private readonly store = inject(SalesContextAdminStore);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  /** Ouvrir ou régler un contexte est un geste d'admin, et lui seul. */
  protected readonly canWrite = computed(() => this.permissions.can('catalog:write'));

  protected readonly contexts = this.store.items;
  protected readonly loadError = this.store.loadError;

  private readonly allColumns: readonly FoldTableColumn[] = [
    { key: 'label', label: 'Contexte' },
    { key: 'scope', label: 'Vendu depuis', width: '14rem' },
    { key: 'shopify', label: 'Shopify', width: '10rem' },
    { key: 'state', label: 'État', width: '9rem' },
    { key: 'actions', label: '', width: '3.5rem' },
  ];

  /** Sans le droit d'écrire, la colonne d'actions n'a rien à porter. */
  protected readonly columns = computed(() =>
    this.canWrite()
      ? this.allColumns
      : this.allColumns.filter((column) => column.key !== 'actions'),
  );

  protected readonly rowKey = (row: SalesContextAdminView): string => row.key;

  /** « Shopify : produit au handle nu », ou rien s'il n'y est pas projeté. */
  protected shopifyLabel(context: SalesContextAdminView): string {
    if (!context.shopifyProjected) {
      return 'Non projeté vers Shopify';
    }
    return context.handleSuffix === ''
      ? 'Shopify — handle nu'
      : `Shopify — handle ${context.handleSuffix}`;
  }

  /**
   * « 2 points de vente » — combien l'OFFRENT, plateforme comprise.
   *
   * Il y avait ici une branche : un contexte « global » affichait « Partout —
   * aucun lieu requis » au lieu d'un compte. Elle est tombée avec
   * `perLocation` (p-2). Le B2B compte désormais 1 : la plateforme
   * professionnelle l'offre, et elle est un point de vente comme un autre.
   */
  protected scopeLabel(context: SalesContextAdminView): string {
    const count = context.offeredByLocations;
    return count === 0 ? 'Aucun point de vente' : `${count} point(s) de vente`;
  }

  protected readonly rootCount = computed(
    () => this.contexts().filter((context) => context.root).length,
  );

  /** Ouvre le panneau — création sans charge, réglage avec. */
  protected open(context?: SalesContextAdminView): void {
    this.panelHost.open<boolean>(SalesContextPanel, {
      side: 'right',
      ...(context === undefined ? {} : { data: { context } }),
    });
  }

  protected retry(): void {
    void this.store.reload().catch(() => undefined);
  }
}
