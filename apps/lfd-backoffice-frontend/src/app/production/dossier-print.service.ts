import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ProductionDossierPart,
  ProductionPrintOptionsView,
  ProvisionalPrintPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

/**
 * **Ce qu'on retire du dossier figé** après l'arrêt. Une liste absente vaut
 * « tout » : le serveur rend alors le dossier archivé, tel quel.
 */
export interface FrozenDossierSelection {
  readonly parts?: readonly ProductionDossierPart[];
  /** Libellés de rayons ou de postes : un paramètre RÉPÉTÉ, un libellé peut porter une virgule. */
  readonly groups?: readonly string[];
  readonly orders?: readonly string[];
}

/**
 * **Les tirages du dossier du jour, partie par partie** (plan
 * `documentation/fournil/plan-impression-provisoire.md`, § 4) : l'état de la
 * fenêtre, l'impression provisoire avant l'arrêt, les parties du dossier
 * figé après.
 *
 * Les PDF se lisent en `Blob` par `HttpClient` : la route exige le jeton, et
 * un `<a href>` partirait sans lui.
 */
@Injectable({ providedIn: 'root' })
export class DossierPrintService {
  private readonly http = inject(HttpClient);

  private batchUrl(date: string): string {
    return `${B2B_API_BASE}/admin/production/batch/${encodeURIComponent(date)}`;
  }

  /** L'état de la fenêtre d'impression d'une journée (`AAAA-MM-JJ`). */
  async printOptions(date: string): Promise<ProductionPrintOptionsView> {
    return firstValueFrom(
      this.http.get<ProductionPrintOptionsView>(`${this.batchUrl(date)}/print-options`),
    );
  }

  /**
   * **Tire une impression provisoire** — un numéro de la journée — et rend
   * son identifiant. Par intention : la clé vient de la `GestureIntents` de
   * la fenêtre, un double clic ne tire pas deux numéros. 409 quand rien n'a
   * changé depuis le tirage choisi, ou que la journée vient d'être arrêtée.
   */
  async drawProvisional(
    date: string,
    payload: ProvisionalPrintPayload,
    intentKey: string,
  ): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<{ readonly id: string }>(
        `${this.batchUrl(date)}/provisional-print`,
        payload,
        intentOptions(intentKey),
      ),
    );
    return created.id;
  }

  /** Le PDF d'une impression provisoire, tel qu'il a été rangé au tirage. */
  async provisionalPdf(date: string, id: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.batchUrl(date)}/provisional-print/${encodeURIComponent(id)}.pdf`, {
        responseType: 'blob',
      }),
    );
  }

  /**
   * Les parties choisies du dossier **figé** ; sans sélection, le dossier
   * archivé. Refusé en 409 tant que la journée n'est pas arrêtée.
   */
  async frozenPdf(date: string, selection: FrozenDossierSelection = {}): Promise<Blob> {
    let params = new HttpParams();
    if (selection.parts !== undefined) {
      params = params.set('parts', selection.parts.join(','));
    }
    for (const group of selection.groups ?? []) {
      params = params.append('groups', group);
    }
    if (selection.orders !== undefined) {
      params = params.set('orders', selection.orders.join(','));
    }
    return firstValueFrom(
      this.http.get(`${this.batchUrl(date)}/dossier.pdf`, { params, responseType: 'blob' }),
    );
  }
}
