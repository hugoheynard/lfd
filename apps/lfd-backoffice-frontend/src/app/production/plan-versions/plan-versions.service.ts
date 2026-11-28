import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  DossierDispatchView,
  PlanVersionDiffView,
  PlanVersionDossierResendPayload,
  PlanVersionView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { intentOptions } from '../../shared/gesture-intents';

/** Les deux papiers rangés d'une version. */
export type PlanVersionPaperKind = 'dossier' | 'count';

const PAPER_FILES: Readonly<Record<PlanVersionPaperKind, string>> = {
  dossier: 'dossier.pdf',
  count: 'compte-a-produire.pdf',
};

/**
 * **Les versions du plan d'une journée** (`documentation/fournil/les-versions-du-plan.md`) :
 * la liste, la comparaison de deux versions et ce que chaque destinataire du
 * dossier a reçu ; le papier rangé de chaque version ; et le renvoi de la
 * version courante.
 */
@Injectable({ providedIn: 'root' })
export class PlanVersionsService {
  private readonly http = inject(HttpClient);

  private versionsUrl(date: string): string {
    return `${B2B_API_BASE}/admin/production/batch/${encodeURIComponent(date)}/plan-history`;
  }

  /** Les versions de la journée (`AAAA-MM-JJ`), de la première à la dernière ; vide sans version. */
  async list(date: string): Promise<readonly PlanVersionView[]> {
    return firstValueFrom(this.http.get<readonly PlanVersionView[]>(this.versionsUrl(date)));
  }

  /** Ce qui a changé de `from` à `to` ; 400 si `from > to`, 404 sur une version inconnue. */
  async compare(date: string, from: number, to: number): Promise<PlanVersionDiffView> {
    const params = new HttpParams().set('from', from).set('to', to);
    return firstValueFrom(
      this.http.get<PlanVersionDiffView>(`${this.versionsUrl(date)}/compare`, { params }),
    );
  }

  /** Les destinataires du dossier, et la dernière version que chacun a reçue. */
  async dispatches(date: string): Promise<readonly DossierDispatchView[]> {
    return firstValueFrom(
      this.http.get<readonly DossierDispatchView[]>(`${this.versionsUrl(date)}/dispatches`),
    );
  }

  /** Le papier RANGÉ d'une version ; 404 s'il ne l'est pas ou si la version est inconnue. */
  async paper(date: string, version: number, kind: PlanVersionPaperKind): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.versionsUrl(date)}/${version}/${PAPER_FILES[kind]}`, {
        responseType: 'blob',
      }),
    );
  }

  /**
   * Renvoie le dossier de la version courante (204). La clé d'intention vient
   * d'une `GestureIntents` de l'écran : un double clic ne renvoie pas deux e-mails.
   */
  async resend(
    date: string,
    payload: PlanVersionDossierResendPayload,
    intentKey: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.versionsUrl(date)}/resend`, payload, intentOptions(intentKey)),
    );
  }
}
