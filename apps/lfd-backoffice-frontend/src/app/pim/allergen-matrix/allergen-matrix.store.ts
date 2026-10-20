import { Injectable, computed, inject, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import type { AllergenMatrixScope, AllergenMatrixView, Locale } from '@lfd/pim-contracts';

import { saveBlob } from '../../shared/download/save-blob';
import {
  AllergenMatrixHttpApi,
  type AllergenMatrixFile,
  type AllergenMatrixFilters,
} from './allergen-matrix-http-api';

/** Une famille proposée au filtre. */
export interface FamilyOption {
  readonly value: string;
  readonly label: string;
}

/** Ce qu'on exporte : le PDF A4, ou le tableur. */
export type MatrixExportKind = 'pdf' | 'csv';

/** La langue de la PAGE : l'écran parle français, seuls les exports changent de langue (Q4). */
const SCREEN_LOCALE: Locale = 'fr';

const FALLBACK_FILE_NAMES: Readonly<Record<MatrixExportKind, string>> = {
  pdf: 'matrice-allergenes.pdf',
  csv: 'matrice-allergenes.csv',
};

/**
 * **L'état de la page « Matrice des allergènes »** — les filtres, la matrice
 * lue, et les exports (plan `documentation/pim/plan-matrice-des-allergenes.md`,
 * AM3).
 *
 * Fourni par la page, pas à la racine : les filtres sont ceux d'une visite, et
 * revenir sur l'écran repart du défaut du plan (publiés, toutes familles, non
 * renseignés inclus).
 *
 * La page ATTEND sa donnée — un tableau sans matrice ne dit rien —, d'où un
 * état de chargement, à l'inverse des listes tenues par un store.
 */
@Injectable()
export class AllergenMatrixStore {
  private readonly api = inject(AllergenMatrixHttpApi);

  readonly scope = signal<AllergenMatrixScope>('published');
  readonly categoryId = signal<string | null>(null);
  readonly includeUndeclared = signal(true);
  /** La langue des fichiers exportés — un PDF est ENTIER dans sa langue (Q4). */
  readonly exportLocale = signal<Locale>('fr');

  readonly view = signal<AllergenMatrixView | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly exporting = signal<MatrixExportKind | null>(null);
  readonly exportError = signal<string | null>(null);

  /**
   * Les familles du filtre — celles que la matrice SANS filtre de famille a
   * rendues, gardées quand on en choisit une : la vue filtrée ne contient plus
   * que celle-là.
   *
   * ⚠️ Une famille qui n'a aucune fiche à elle (une famille mère dont tout vit
   * dans ses sous-familles) n'y figure pas : la matrice ne la nomme jamais.
   * La liste complète des familles est sous `pim_catalog`, que le seul droit
   * `allergen_matrix` n'ouvre pas.
   */
  readonly familyOptions = signal<readonly FamilyOption[]>([]);

  readonly hasRows = computed(
    () => this.view()?.families.some((family) => family.rows.length > 0) ?? false,
  );

  /** Le numéro de la dernière demande : une réponse plus ancienne n'écrase rien. */
  private requestSeq = 0;

  setScope(scope: AllergenMatrixScope): void {
    this.scope.set(scope);
    void this.load();
  }

  setCategory(categoryId: string | null): void {
    this.categoryId.set(categoryId);
    void this.load();
  }

  setIncludeUndeclared(include: boolean): void {
    this.includeUndeclared.set(include);
    void this.load();
  }

  /**
   * Relit la matrice. L'échec est retenu dans `loadError`, pas relancé :
   * c'est la lecture que la page déclenche seule, à l'ouverture comme à chaque
   * filtre — personne derrière n'attend le refus.
   */
  async load(): Promise<void> {
    const seq = ++this.requestSeq;
    const filters = this.filters(SCREEN_LOCALE);
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const view = await this.api.read(filters);
      if (seq !== this.requestSeq) {
        return;
      }
      this.view.set(view);
      if (filters.categoryId === null) {
        this.familyOptions.set(
          view.families.map((family) => ({ value: family.id, label: family.name })),
        );
      }
    } catch (caught) {
      if (seq === this.requestSeq) {
        this.loadError.set(httpErrorMessage(caught));
      }
    } finally {
      if (seq === this.requestSeq) {
        this.loading.set(false);
      }
    }
  }

  /** Télécharge le PDF ou le tableur, avec les filtres de la page et la langue choisie. */
  async export(kind: MatrixExportKind): Promise<void> {
    if (this.exporting() !== null) {
      return;
    }
    this.exporting.set(kind);
    this.exportError.set(null);
    try {
      const filters = this.filters(this.exportLocale());
      const file: AllergenMatrixFile =
        kind === 'pdf' ? await this.api.pdf(filters) : await this.api.csv(filters);
      saveBlob(file.blob, file.fileName ?? FALLBACK_FILE_NAMES[kind]);
    } catch (caught) {
      this.exportError.set(httpErrorMessage(caught));
    } finally {
      this.exporting.set(null);
    }
  }

  private filters(locale: Locale): AllergenMatrixFilters {
    return {
      locale,
      scope: this.scope(),
      categoryId: this.categoryId(),
      includeUndeclared: this.includeUndeclared(),
    };
  }
}
