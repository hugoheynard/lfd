import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  QualityBoardView,
  QualityCheckRendered,
  QualityChecksView,
  QualityPhotoUploaded,
  RenderQualityCheckPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

const QUALITY = `${B2B_API_BASE}/admin/supervision/quality`;

/**
 * **Le contrôle qualité de la Supervision** (`plan-controle-qualite.md`, D3,
 * D8) — `admin/supervision/quality`.
 *
 * Deux niveaux de lecture, et c'est le serveur qui les tient : les pastilles
 * (`board`) en `read`, le détail et les photos en `write`. L'écran ne demande
 * le détail qu'à qui peut juger ; un `read` qui le demanderait serait refusé.
 *
 * Le geste est coupé en deux : chaque photo est déposée seule (`deposit`), puis
 * le verdict la rattache par son `uploadId` (`render`).
 */
@Injectable({ providedIn: 'root' })
export class QualityService {
  private readonly http = inject(HttpClient);

  /** Les pastilles d'une journée — `read` suffit. */
  board(date: string): Promise<QualityBoardView> {
    return firstValueFrom(
      this.http.get<QualityBoardView>(`${QUALITY}?date=${encodeURIComponent(date)}`),
    );
  }

  /** Les verdicts d'une journée, notes comprises, du plus récent au plus ancien — `write`. */
  checks(date: string): Promise<QualityChecksView> {
    return firstValueFrom(
      this.http.get<QualityChecksView>(`${QUALITY}/checks?date=${encodeURIComponent(date)}`),
    );
  }

  /** Les octets d'une photo de contrôle — `write`, jamais une URL publique. */
  photo(checkId: string, position: number): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${QUALITY}/checks/${encodeURIComponent(checkId)}/photos/${String(position)}`, {
        responseType: 'blob',
      }),
    );
  }

  /** Déposer UNE photo, dès qu'elle est choisie — rend l'identifiant à rattacher. */
  async deposit(photo: Blob): Promise<string> {
    const body = new FormData();
    body.append('photo', photo);
    const uploaded = await firstValueFrom(
      this.http.post<QualityPhotoUploaded>(`${QUALITY}/photos`, body),
    );
    return uploaded.uploadId;
  }

  /** Rendre un verdict — idempotent par `payload.id`. */
  async render(payload: RenderQualityCheckPayload): Promise<string> {
    const rendered = await firstValueFrom(
      this.http.post<QualityCheckRendered>(`${QUALITY}/checks`, payload),
    );
    return rendered.id;
  }
}
