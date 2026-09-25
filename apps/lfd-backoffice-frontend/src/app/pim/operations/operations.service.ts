import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  EditOperationPayload,
  OperationAudience,
  OperationKeyResponse,
  OperationView,
  PrepareOperationPayload,
  RescheduleOperationPayload,
} from '@lfd/pim-contracts';

import { API_BASE_URL } from '../data/api';

/**
 * **Les opérations datées** — Noël, Pâques, la galette
 * (`documentation/order/architecture-operations-datees.md`).
 *
 * Un `PUT` par sujet, jamais un `PUT` de l'opération entière : le serveur
 * découpe ses écritures comme l'écran découpe ses cartes, et chaque sujet a sa
 * règle — les cinq dates ne se vérifient qu'à cinq, la sélection se réécrit en
 * entier. Envoyer le nom avec les dates ferait refuser un renommage pour une
 * date contradictoire qu'on n'a pas touchée.
 *
 * La clé est l'identité, et elle entre dans l'URL : `encodeURIComponent` par
 * principe, même si le serveur n'admet que minuscules, chiffres et tirets.
 */
@Injectable({ providedIn: 'root' })
export class OperationsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  async list(): Promise<readonly OperationView[]> {
    return firstValueFrom(this.http.get<readonly OperationView[]>(this.url()));
  }

  async get(key: string): Promise<OperationView> {
    return firstValueFrom(this.http.get<OperationView>(this.url(key)));
  }

  /** Crée l'opération. Rend sa clé — l'écran relit ensuite (CQRS). */
  async prepare(payload: PrepareOperationPayload): Promise<OperationKeyResponse> {
    return firstValueFrom(this.http.post<OperationKeyResponse>(this.url(), payload));
  }

  async editPresentation(key: string, payload: EditOperationPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.url(key, 'presentation'), payload));
  }

  /** Les cinq dates, ensemble : leur ordre ne se vérifie qu'à cinq. */
  async reschedule(key: string, payload: RescheduleOperationPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.url(key, 'schedule'), payload));
  }

  async setAudience(key: string, audience: OperationAudience): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.url(key, 'audience'), { audience }));
  }

  /** La sélection ENTIÈRE, dans l'ordre d'affichage. */
  async setSelection(key: string, skus: readonly string[]): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.url(key, 'selection'), { skus }));
  }

  async archive(key: string): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.url(key, 'archive'), {}));
  }

  private url(key?: string, subject?: string): string {
    const root = `${this.base}/operations`;
    if (key === undefined) {
      return root;
    }
    const one = `${root}/${encodeURIComponent(key)}`;
    return subject === undefined ? one : `${one}/${subject}`;
  }
}
