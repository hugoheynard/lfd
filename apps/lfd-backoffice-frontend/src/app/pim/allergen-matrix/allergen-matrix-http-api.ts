import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AllergenMatrixScope, AllergenMatrixView, Locale } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { attachmentFileName } from '../../shared/download/content-disposition';
import { API_BASE_URL } from '../data/api';

/** Les filtres d'une demande de matrice — ceux de `allergenMatrixQuerySchema`. */
export interface AllergenMatrixFilters {
  readonly locale: Locale;
  readonly scope: AllergenMatrixScope;
  /** Une famille ET ses sous-familles ; `null` = toutes. */
  readonly categoryId: string | null;
  readonly includeUndeclared: boolean;
}

/** Un fichier reçu, et le nom que le serveur lui donne (ou `null` s'il est illisible). */
export interface AllergenMatrixFile {
  readonly blob: Blob;
  readonly fileName: string | null;
}

/**
 * **La matrice des allergènes** — `GET /pim/allergen-matrix`, son tableur et
 * son PDF, sous le droit `allergen_matrix` (plan
 * `documentation/pim/plan-matrice-des-allergenes.md`, AM1–AM3).
 *
 * Les fichiers passent par `HttpClient` et non par un lien : l'intercepteur
 * pose le jeton staff, qu'un `<a href>` vers l'API n'enverrait pas.
 */
@Injectable({ providedIn: 'root' })
export class AllergenMatrixHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  read(filters: AllergenMatrixFilters): Promise<AllergenMatrixView> {
    return firstValueFrom(
      this.http.get<AllergenMatrixView>(`${this.base}/allergen-matrix`, {
        params: paramsOf(filters),
      }),
    );
  }

  pdf(filters: AllergenMatrixFilters): Promise<AllergenMatrixFile> {
    return this.file(`${this.base}/allergen-matrix.pdf`, filters);
  }

  csv(filters: AllergenMatrixFilters): Promise<AllergenMatrixFile> {
    return this.file(`${this.base}/allergen-matrix.csv`, filters);
  }

  private async file(url: string, filters: AllergenMatrixFilters): Promise<AllergenMatrixFile> {
    const response = await firstValueFrom(
      this.http.get(url, { params: paramsOf(filters), responseType: 'blob', observe: 'response' }),
    );
    if (response.body === null) {
      throw new Error('Le fichier est arrivé sans contenu.');
    }
    return {
      blob: response.body,
      fileName: attachmentFileName(response.headers.get('Content-Disposition')),
    };
  }
}

function paramsOf(filters: AllergenMatrixFilters): HttpParams {
  let params = new HttpParams()
    .set('locale', filters.locale)
    .set('scope', filters.scope)
    .set('includeUndeclared', filters.includeUndeclared ? '1' : '0');
  if (filters.categoryId !== null) {
    params = params.set('categoryId', filters.categoryId);
  }
  return params;
}
