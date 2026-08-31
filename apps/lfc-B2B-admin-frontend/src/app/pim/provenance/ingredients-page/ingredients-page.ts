import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { IngredientView } from '@lfd/pim-contracts';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowCardDirective,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { IngredientPanel } from '../ingredient-panel/ingredient-panel';
import { ProvenanceStore } from '../provenance.store';

/**
 * **Ingrédients** — d'où vient ce qu'il y a dedans.
 *
 * ⚠️ Ce n'est PAS la liste réglementaire d'ingrédients (règlement UE
 * 1169/2011). Celle-là est ordonnée par masse décroissante, porte des
 * quantités, décrit une recette — elle appartient à la déclinaison, avec ses
 * allergènes. Ce référentiel-ci sert la provenance : un badge, un argument de
 * vente, une fiche B2B qui se suffit à elle-même.
 */
@Component({
  selector: 'app-ingredients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldDataTableRowCardDirective,
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldButtonComponent,
    FoldIconComponent,
  ],
  templateUrl: './ingredients-page.html',
  styleUrl: './ingredients-page.scss',
})
export class IngredientsPage {
  private readonly store = inject(ProvenanceStore);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('catalog:write'));
  protected readonly ingredients = this.store.ingredients;
  protected readonly loadError = this.store.ingredientError;

  private readonly allColumns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Ingrédient' },
    { key: 'origin', label: 'Origine', width: '16rem' },
    { key: 'appellation', label: 'Appellation', width: '14rem' },
    { key: 'used', label: 'Cité par', width: '9rem' },
    { key: 'actions', label: '', width: '3.5rem' },
  ];

  protected readonly columns = computed(() =>
    this.canWrite()
      ? this.allColumns
      : this.allColumns.filter((column) => column.key !== 'actions'),
  );

  protected readonly rowKey = (row: IngredientView): string => row.key;

  protected usedLabel(row: IngredientView): string {
    return row.usedBy === 0 ? 'Aucune fiche' : `${String(row.usedBy)} fiche(s)`;
  }

  /** « AOP — Beaufort », ou le libellé seul quand le signe n'est pas renseigné. */
  protected appellationLabel(row: IngredientView): string {
    const held = row.appellation;
    if (held === null) {
      return '';
    }
    return held.scheme === '' ? held.label.fr : `${held.scheme} — ${held.label.fr}`;
  }

  protected open(ingredient?: IngredientView): void {
    this.panelHost.open<boolean>(IngredientPanel, {
      side: 'right',
      ...(ingredient === undefined ? {} : { data: { ingredient } }),
    });
  }

  protected retry(): void {
    void this.store.reload().catch(() => undefined);
  }
}
