import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  DepartDeliveryRoundPayload,
  MyDeliveryRoundsView,
  MyDeliveryRoundView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const MY_ROUND = `${B2B_API_BASE}/admin/livraison/ma-tournee`;

/**
 * **« Ma tournée »** (`plan-ma-tournee.md`, MT-D4), sous `delivery_driving`.
 *
 * Le livreur n'est jamais un paramètre : c'est la personne connectée, et le
 * serveur la met dans le `where`. Une tournée d'un autre rend 404.
 */
@Injectable({ providedIn: 'root' })
export class MyDeliveryRoundService {
  private readonly http = inject(HttpClient);

  mine(date: string): Promise<MyDeliveryRoundsView> {
    return firstValueFrom(
      this.http.get<MyDeliveryRoundsView>(`${MY_ROUND}?date=${encodeURIComponent(date)}`),
    );
  }

  round(roundId: string): Promise<MyDeliveryRoundView> {
    return firstValueFrom(
      this.http.get<MyDeliveryRoundView>(`${MY_ROUND}/${encodeURIComponent(roundId)}`),
    );
  }

  /** « Commencer ma tournée », avec la version lue : une tournée modifiée entre-temps est refusée. */
  async depart(roundId: string, payload: DepartDeliveryRoundPayload): Promise<void> {
    await firstValueFrom(
      this.http.post(`${MY_ROUND}/${encodeURIComponent(roundId)}/depart`, payload),
    );
  }

  /**
   * La photo d'une étape de procédure d'un de MES arrêts, en blob : un
   * `<img src>` nu n'enverrait pas le jeton. `rev` dans l'URL : la route répond
   * `immutable`, et c'est la révision qui fait d'une photo remplacée une autre
   * ressource pour le cache.
   */
  stepPhoto(roundId: string, stopId: string, stepId: string, revision: string): Promise<Blob> {
    const path = [roundId, 'arrets', stopId, 'procedure', stepId, 'photo']
      .map((part) => encodeURIComponent(part))
      .join('/');
    return firstValueFrom(
      this.http.get(`${MY_ROUND}/${path}`, { params: { rev: revision }, responseType: 'blob' }),
    );
  }
}
