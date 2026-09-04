import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { OrderTimeLimitPayload, OrderTimeLimitView } from '@lfd/pim-contracts';

import { API_BASE_URL } from '../data/api';

/**
 * **Points d'arrêt de prise de commande** — jusqu'à quand on accepte une
 * commande, par portée du catalogue.
 *
 * `PUT` sans identifiant, et c'est le serveur qui le veut : la **portée** est la
 * clé. Un écran qui pose « la viennoiserie ferme à 16 h » n'a pas à savoir si
 * quelqu'un l'a déjà posée — la question n'a aucun sens pour lui, et l'obliger à
 * y répondre le ferait se tromper une fois sur deux.
 */
@Injectable({ providedIn: 'root' })
export class OrderTimeLimitsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  async list(): Promise<readonly OrderTimeLimitView[]> {
    return firstValueFrom(this.http.get<readonly OrderTimeLimitView[]>(this.url()));
  }

  /** Crée ou remplace la règle de cette portée. Rend son identifiant. */
  async set(payload: OrderTimeLimitPayload): Promise<{ id: string }> {
    return firstValueFrom(this.http.put<{ id: string }>(this.url(), payload));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.url()}/${id}`));
  }

  private url(): string {
    return `${this.base}/order-time-limits`;
  }
}
