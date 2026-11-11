import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  PriceGridExportPayload,
  PriceGridPromotionsView,
  PriceGridQuestion,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../../api/api-config';
import { attachmentFileName } from '../../../shared/download/content-disposition';

/** Le fichier de la grille, et le nom que le serveur lui donne. */
export interface PriceGridFile {
  readonly blob: Blob;
  readonly fileName: string;
}

/** Le nom de repli, si l'en-tête n'a pas traversé. */
const FALLBACK_FILE_NAME = 'grille-de-prix.csv';

/**
 * **La grille de prix d'un public** (`export-grille-de-prix.md`) — deux
 * lectures sous `b2b_pricing:read`, en `POST` parce que la question est un
 * objet. Rien n'est écrit.
 */
@Injectable({ providedIn: 'root' })
export class PriceGridHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/pricing/price-grid`;

  /** Les promotions que ce public reçoit, à ce jour, pour cet acheminement. */
  promotions(question: PriceGridQuestion): Promise<PriceGridPromotionsView> {
    return firstValueFrom(
      this.http.post<PriceGridPromotionsView>(`${this.base}/promotions`, question),
    );
  }

  /**
   * Le CSV, en **blob** : il porte un BOM UTF-8, qu'une chaîne JavaScript
   * collerait au premier titre du tableur.
   */
  async export(payload: PriceGridExportPayload): Promise<PriceGridFile> {
    const response = await firstValueFrom(
      this.http.post(`${this.base}/export`, payload, { responseType: 'blob', observe: 'response' }),
    );
    if (response.body === null) {
      throw new Error('La grille est arrivée sans contenu.');
    }
    return {
      blob: response.body,
      fileName:
        attachmentFileName(response.headers.get('Content-Disposition')) ?? FALLBACK_FILE_NAME,
    };
  }
}
