import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  ALLERGEN_MATRIX_SCOPES,
  ALLERGEN_MATRIX_WORDING,
  type AllergenMatrixRow,
  type AllergenMatrixScope,
  type Locale,
} from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowNoteDirective,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import {
  MARK_SIGNS,
  capitalized,
  categoryMarks,
  otherMarks,
  parisDateTime,
  type MarkLine,
} from '../allergen-matrix-marks';
import { AllergenMatrixStore, type MatrixExportKind } from '../allergen-matrix.store';

/** Les mots de l'écran : ceux du dictionnaire de la matrice, en français (AM1). */
const WORDING = ALLERGEN_MATRIX_WORDING.fr;

/** Les langues des exports, chacune dite dans la sienne n'aiderait personne ici. */
const EXPORT_LOCALES: readonly { readonly value: Locale; readonly label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
  { value: 'it', label: 'Italien' },
];

const PRODUCT_KEY = 'product';
const OTHERS_KEY = 'others';
/** Les clés de colonne écrites dans le gabarit (`allergen-0` … `allergen-13`). */
const ALLERGEN_SLOT_COUNT = 14;

/** La clé de la `index`-ième colonne d'allergène — positionnelle, cf. le gabarit. */
function allergenKey(index: number): string {
  return `allergen-${index}`;
}

/** Le texte d'une case, pour une colonne au-delà des gabarits écrits. */
function marksText(lines: readonly MarkLine[]): string {
  return lines.map((line) => `${MARK_SIGNS[line.kind]} ${line.names}`.trim()).join(' · ');
}

/**
 * **La matrice des allergènes** — chaque déclinaison, et les allergènes de
 * l'annexe II qu'elle contient ou peut contenir, à imprimer à chaque
 * changement de la gamme (plan `documentation/pim/plan-matrice-des-allergenes.md`,
 * AM3).
 *
 * L'écran ne calcule RIEN : la matrice arrive rangée par le serveur
 * (`IncoProjector`, plan §2). Il ne fait que la peindre — et tenir les trois
 * états qui sont tout son objet : « non renseigné » n'est pas « aucun », qui
 * n'est pas « ne contient pas cette catégorie ».
 */
@Component({
  selector: 'app-allergen-matrix-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AllergenMatrixStore],
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDataTableRowNoteDirective,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    NgTemplateOutlet,
  ],
  templateUrl: './allergen-matrix-page.html',
  styleUrl: './allergen-matrix-page.scss',
})
export class AllergenMatrixPage {
  protected readonly store = inject(AllergenMatrixStore);

  protected readonly wording = WORDING;
  protected readonly signs = MARK_SIGNS;
  protected readonly exportLocales = EXPORT_LOCALES;
  protected readonly scopeOptions = ALLERGEN_MATRIX_SCOPES.map((scope) => ({
    value: scope,
    label: WORDING.document.scopes[scope],
  }));

  /** Les mots de la légende, chacun ouvert par une capitale. */
  protected readonly legend = {
    contains: capitalized(WORDING.presence.contains),
    traces: capitalized(WORDING.presence.traces),
  };

  /** Produit, puis les catégories de l'annexe II dans l'ordre du référentiel, puis « Autres ». */
  protected readonly columns = computed<readonly FoldTableColumn<AllergenMatrixRow>[]>(() => {
    const view = this.store.view();
    return [
      { key: PRODUCT_KEY, label: WORDING.headers.product },
      ...(view?.columns ?? []).map((column, index) => ({
        key: allergenKey(index),
        label: column.label,
        align: 'center' as const,
        // Seulement au-delà des gabarits : un gabarit l'emporte sur `value`.
        ...(index >= ALLERGEN_SLOT_COUNT
          ? { value: (row: AllergenMatrixRow) => marksText(categoryMarks(row, column.category)) }
          : {}),
      })),
      { key: OTHERS_KEY, label: WORDING.headers.others },
    ];
  });

  private readonly categoryKeys = computed(
    () => this.store.view()?.columns.map((column) => column.category) ?? [],
  );

  protected readonly families = computed(
    () => this.store.view()?.families.filter((family) => family.rows.length > 0) ?? [],
  );

  protected readonly lastModified = computed(() => {
    const at = this.store.view()?.lastModifiedAt ?? null;
    return at === null
      ? null
      : WORDING.document.lastModifiedAt.replace('{date}', parisDateTime(at));
  });

  protected readonly rowKey = (row: AllergenMatrixRow): string => row.variantId;

  /** L'état de la ligne s'écrit sous elle, sur toute sa largeur, dès qu'il n'est pas `declared`. */
  protected readonly hasStateNote = (row: AllergenMatrixRow): boolean => row.state !== 'declared';

  /** « Non renseigné » appelle une saisie ; « à revoir », une correction. */
  protected readonly rowTone = (row: AllergenMatrixRow): FoldTableTone => {
    switch (row.state) {
      case 'not_declared':
        return 'warning';
      case 'to_review':
        return 'alert';
      default:
        return null;
    }
  };

  /** Les marques de la `index`-ième colonne d'allergène ; rien si elle n'existe pas. */
  protected categoryMarksAt(row: AllergenMatrixRow, index: number): readonly MarkLine[] {
    const category = this.categoryKeys()[index];
    return category === undefined ? [] : categoryMarks(row, category);
  }

  protected otherMarks(row: AllergenMatrixRow): readonly MarkLine[] {
    return otherMarks(row);
  }

  protected stateLabel(row: AllergenMatrixRow): string {
    return WORDING.states[row.state];
  }

  protected sign(line: MarkLine): string {
    return MARK_SIGNS[line.kind];
  }

  protected markLabel(line: MarkLine): string {
    return line.kind === 'contains' ? this.legend.contains : this.legend.traces;
  }

  protected setScope(scope: AllergenMatrixScope): void {
    this.store.setScope(scope);
  }

  protected setCategory(categoryId: string | null): void {
    this.store.setCategory(categoryId);
  }

  protected setIncludeUndeclared(include: boolean): void {
    this.store.setIncludeUndeclared(include);
  }

  protected setExportLocale(locale: Locale): void {
    this.store.exportLocale.set(locale);
  }

  protected export(kind: MatrixExportKind): void {
    void this.store.export(kind);
  }

  protected retry(): void {
    void this.store.load();
  }

  constructor() {
    void this.store.load();
  }
}
