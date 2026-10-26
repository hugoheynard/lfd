import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
  FoldElementTitleComponent,
  FoldPaginatorComponent,
  FoldPanelHostService,
  FoldViewToggleComponent,
  FoldSearchComponent,
  type FoldBadgeVariant,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { IngredientPanel } from '../ingredient-panel/ingredient-panel';
import { ProvenanceStore } from '../provenance.store';
import {
  ALLERGEN_STATE_OPTIONS,
  visibleIngredients,
  type AllergenStateFilter,
} from './ingredients-filter';

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
    FoldSearchComponent,
    FoldElementTitleComponent,
    FoldPaginatorComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './ingredients-page.html',
  styleUrl: './ingredients-page.scss',
})
export class IngredientsPage {
  private readonly store = inject(ProvenanceStore);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('pim_catalog:write'));
  protected readonly ingredients = this.store.ingredients;
  protected readonly loadError = this.store.ingredientError;
  protected readonly query = signal('');
  protected readonly allergenState = signal<AllergenStateFilter>('all');
  protected readonly allergenStateOptions = ALLERGEN_STATE_OPTIONS;
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);

  /** L'état d'allergènes puis la recherche, côté client — motif de `products-page`. */
  protected readonly visibleIngredients = computed(() =>
    visibleIngredients(this.ingredients(), this.allergenState(), this.query()),
  );

  private readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.visibleIngredients().length / this.pageSize())),
  );

  protected readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  protected readonly pagedIngredients = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.visibleIngredients().slice(start, start + this.pageSize());
  });

  private readonly allColumns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Ingrédient' },
    { key: 'origin', label: 'Origine', width: '16rem' },
    { key: 'appellation', label: 'Appellation', width: '14rem' },
    { key: 'allergens', label: 'Allergènes', width: '11rem' },
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

  /**
   * « 3 allergènes » — le COMPTE, jamais la liste : quatre badges de codes GS1
   * par ligne noieraient le tableau, et un ingrédient s'ouvre pour les lire.
   */
  protected allergenCount(row: IngredientView): string {
    const declared = row.allergens.length;
    return declared === 1 ? '1 allergène' : `${String(declared)} allergènes`;
  }

  /**
   * Le badge de la colonne : vert « Aucun allergène » (déclaré), orange le
   * compte, rouge « Non renseigné » — décision de Hugo du 2026-10-26.
   */
  protected allergenBadge(row: IngredientView): {
    readonly label: string;
    readonly variant: FoldBadgeVariant;
  } {
    if (row.allergens.length > 0) {
      return { label: this.allergenCount(row), variant: 'warning' };
    }
    return row.declaresNoAllergen
      ? { label: 'Aucun allergène', variant: 'success' }
      : { label: 'Non renseigné', variant: 'alert' };
  }

  /**
   * Sur la carte mobile, le silence est NOMMÉ.
   *
   * Un ingrédient sans code n'est pas un ingrédient « sans allergène » : c'est
   * un ingrédient dont personne n'a rien dit (cf. `IngredientView.allergens`).
   * Écrire « aucun allergène » ferait dire à la liste une chose que le
   * référentiel n'atteste pas, et sur ce sujet-là le raccourci se paie.
   */
  protected allergenSummary(row: IngredientView): string {
    if (row.allergens.length > 0) {
      return this.allergenCount(row);
    }
    return row.declaresNoAllergen ? 'Aucun allergène' : 'Allergènes non renseignés';
  }

  /** Un référentiel rempli que la recherche vide ne doit pas inviter à créer. */
  protected readonly noMatch = {
    title: 'Aucun ingrédient ne correspond',
    subtitle: 'Essayez une autre recherche, ou un autre état des allergènes.',
  } as const;

  /** Chercher ou filtrer remet en page 1 : on ne reste pas sur une page vide. */
  protected onSearch(query: string): void {
    this.query.set(query);
    this.page.set(1);
  }

  protected chooseAllergenState(value: string): void {
    this.allergenState.set(
      ALLERGEN_STATE_OPTIONS.find((option) => option.value === value)?.value ?? 'all',
    );
    this.page.set(1);
  }

  protected onPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
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
