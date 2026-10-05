import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CycleStatementView, StatementCyclesView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { attachmentFileName } from '../../shared/download/content-disposition';

/** Le CSV rendu, et le nom que le serveur lui donne — `null` s'il n'en dit rien. */
export interface StatementFile {
  readonly blob: Blob;
  readonly fileName: string | null;
}

const BASE = `${B2B_API_BASE}/admin/accounting/statements`;

/**
 * Le **relevé de cycle** d'un client (plan `agregation-des-commandes`, A2).
 *
 * Le relevé est CALCULÉ PAR LE SERVEUR, et l'écran ne refait aucune somme :
 * la TVA par taux est l'addition des parts figées à la passation, et la
 * recalculer ici donnerait un autre centime que le prélèvement.
 */
@Injectable({ providedIn: 'root' })
export class CycleStatementService {
  private readonly http = inject(HttpClient);

  async cycles(): Promise<StatementCyclesView> {
    return firstValueFrom(this.http.get<StatementCyclesView>(`${BASE}/cycles`));
  }

  async statement(companyId: string, month: string): Promise<CycleStatementView> {
    return firstValueFrom(
      this.http.get<CycleStatementView>(`${BASE}/companies/${encodeURIComponent(companyId)}`, {
        params: { month },
      }),
    );
  }

  /**
   * `responseType: 'blob'` et non `'text'` : le corps porte un BOM UTF-8, qu'une
   * chaîne JavaScript collerait au premier caractère du fichier enregistré.
   */
  async exportCsv(companyId: string, month: string): Promise<StatementFile> {
    const response = await firstValueFrom(
      this.http.get(`${BASE}/companies/${encodeURIComponent(companyId)}/export.csv`, {
        params: { month },
        responseType: 'blob',
        observe: 'response',
      }),
    );
    if (response.body === null) {
      throw new Error('Le relevé est arrivé sans contenu.');
    }
    return {
      blob: response.body,
      fileName: attachmentFileName(response.headers.get('Content-Disposition')),
    };
  }
}
