import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AssignDeliveryDriverPayload,
  AssignDeliveryStopPayload,
  DeliveryDriversView,
  DeliveryRoundsDayView,
  MoveDeliveryStopPayload,
  OpenDeliveryRoundPayload,
  RemoveDeliveryStopPayload,
  ReorderDeliveryRoundPayload,
  UnassignDeliveryDriverPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const ROUNDS = `${B2B_API_BASE}/admin/livraison/tournees`;

function stopUrl(roundId: string, stopId: string): string {
  return `${ROUNDS}/${encodeURIComponent(roundId)}/arrets/${encodeURIComponent(stopId)}`;
}

/**
 * **La composition des tournées** (`plan-preparation-de-tournee.md`, lot 3),
 * sous `delivery_rounds`.
 *
 * Aucun état, et aucun nouvel essai : une écriture refusée parce que la
 * composition a changé (409) remonte telle quelle, et c'est l'écran qui relit.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryRoundsService {
  private readonly http = inject(HttpClient);

  day(day: string): Promise<DeliveryRoundsDayView> {
    return firstValueFrom(
      this.http.get<DeliveryRoundsDayView>(`${ROUNDS}?jour=${encodeURIComponent(day)}`),
    );
  }

  async open(payload: OpenDeliveryRoundPayload): Promise<void> {
    await firstValueFrom(this.http.post(ROUNDS, payload));
  }

  async assign(roundId: string, payload: AssignDeliveryStopPayload): Promise<void> {
    await firstValueFrom(
      this.http.post(`${ROUNDS}/${encodeURIComponent(roundId)}/arrets`, payload),
    );
  }

  async move(roundId: string, stopId: string, payload: MoveDeliveryStopPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${stopUrl(roundId, stopId)}/deplacement`, payload));
  }

  async reorder(roundId: string, payload: ReorderDeliveryRoundPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${ROUNDS}/${encodeURIComponent(roundId)}/ordre`, payload));
  }

  async remove(roundId: string, stopId: string, payload: RemoveDeliveryStopPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${stopUrl(roundId, stopId)}/retrait`, payload));
  }

  /** Qui peut conduire : le droit EFFECTIF `delivery_driving:write` (MT-D2 v2). */
  drivers(): Promise<DeliveryDriversView> {
    return firstValueFrom(this.http.get<DeliveryDriversView>(`${ROUNDS}/livreurs`));
  }

  async assignDriver(roundId: string, payload: AssignDeliveryDriverPayload): Promise<void> {
    await firstValueFrom(
      this.http.put(`${ROUNDS}/${encodeURIComponent(roundId)}/livreur`, payload),
    );
  }

  async unassignDriver(roundId: string, payload: UnassignDeliveryDriverPayload): Promise<void> {
    await firstValueFrom(
      this.http.post(`${ROUNDS}/${encodeURIComponent(roundId)}/livreur/retrait`, payload),
    );
  }

  /** « Déclarer rentrée » depuis Tournées (PL2), sous `delivery_rounds:write` — rejouée, pareil. */
  async returnToDepot(roundId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${ROUNDS}/${encodeURIComponent(roundId)}/retour`, null));
  }
}
