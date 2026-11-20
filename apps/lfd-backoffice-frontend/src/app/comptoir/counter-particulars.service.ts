import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';

import type {
  AdminOrderEstimateView,
  CounterParticularCard,
  CounterParticularCreatePayload,
  CounterParticularOrderEstimatePayload,
  CounterParticularOrderPayload,
  CounterParticularPlacedOrderResponse,
  CreatedIdResponse,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

const PARTICULARS = `${B2B_API_BASE}/admin/counter/particulars`;
const PARTICULAR_ORDERS = `${B2B_API_BASE}/admin/counter/particular-orders`;

/**
 * **La commande d'un particulier notée au comptoir**, à régler à la caisse
 * de la boutique (`plan-commande-particulier-reglee-en-boutique.md`, § 3,
 * § 5, § 5 bis) — transport pur, sous la surface du comptoir.
 *
 * Deux routes à elle, distinctes de la saisie pro : la recherche et la
 * création de LA personne, le devis et la passation, puis les deux gestes de
 * la commande non retirée. Chaque écriture porte la clé d'intention de
 * l'écran ; aucun montant n'est calculé ici.
 */
@Injectable({ providedIn: 'root' })
export class CounterParticularsService {
  private readonly http = inject(HttpClient);

  /** Au plus dix fiches, coordonnées masquées ; deux caractères au moins. */
  search(query: string): Promise<readonly CounterParticularCard[]> {
    return firstValueFrom(
      this.http.get<readonly CounterParticularCard[]>(PARTICULARS, { params: { q: query } }),
    );
  }

  /** Une fiche neuve — 409 `account.counter_particular.contact_taken` si le contact est pris. */
  async create(payload: CounterParticularCreatePayload, intentKey: string): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(PARTICULARS, payload, intentOptions(intentKey)),
    );
    return created.id;
  }

  /** Le devis : ce que la passation écrirait, au centime. Un flux, pour l'annuler en vol. */
  estimate(payload: CounterParticularOrderEstimatePayload): Observable<AdminOrderEstimateView> {
    return this.http.post<AdminOrderEstimateView>(`${PARTICULAR_ORDERS}/estimate`, payload);
  }

  place(
    payload: CounterParticularOrderPayload,
    intentKey: string,
  ): Promise<CounterParticularPlacedOrderResponse> {
    return firstValueFrom(
      this.http.post<CounterParticularPlacedOrderResponse>(
        PARTICULAR_ORDERS,
        payload,
        intentOptions(intentKey),
      ),
    );
  }

  /** « Le client n'est pas venu » — refusé avant la fin du créneau, avec sa phrase. */
  async declareNoShow(orderId: string, intentKey: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${PARTICULAR_ORDERS}/${encodeURIComponent(orderId)}/no-show`,
        {},
        intentOptions(intentKey),
      ),
    );
  }

  /** « Prévenir le client » : l'e-mail est DEMANDÉ, sous le droit de supervision. */
  async requestNoShowNotice(orderId: string, intentKey: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${PARTICULAR_ORDERS}/${encodeURIComponent(orderId)}/no-show-notice`,
        {},
        intentOptions(intentKey),
      ),
    );
  }
}
