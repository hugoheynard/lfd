import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AssignDeliveryDriverPayload,
  AssignDeliveryStopPayload,
  DeliveryCompositionGapsView,
  DeliveryDayReadinessView,
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

const ROUNDS = `${B2B_API_BASE}/admin/delivery/rounds`;

function stopUrl(roundId: string, stopId: string): string {
  return `${ROUNDS}/${encodeURIComponent(roundId)}/stops/${encodeURIComponent(stopId)}`;
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

  /**
   * **La feuille d'une tournée en PDF**, rendue par le serveur.
   *
   * En `Blob` par `HttpClient` et non par un lien : la route exige le jeton, et
   * un `<a href>` partirait sans lui.
   */
  roundPdf(roundId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${ROUNDS}/${encodeURIComponent(roundId)}/round.pdf`, {
        responseType: 'blob',
      }),
    );
  }

  /**
   * **Le dossier des tournées d'un jour en PDF** — toutes les feuilles du
   * jour, en un tirage (`dossier-des-tournees.md`). Même jeton, même `Blob`.
   */
  dayDossierPdf(day: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${ROUNDS}/day/${encodeURIComponent(day)}/dossier.pdf`, {
        responseType: 'blob',
      }),
    );
  }

  day(day: string): Promise<DeliveryRoundsDayView> {
    return firstValueFrom(
      this.http.get<DeliveryRoundsDayView>(`${ROUNDS}?day=${encodeURIComponent(day)}`),
    );
  }

  /** Le plan de ce jour est-il arrêté ? (CA6a) — ce que la livraison a appris de la clôture. */
  readiness(day: string): Promise<DeliveryDayReadinessView> {
    return firstValueFrom(
      this.http.get<DeliveryDayReadinessView>(
        `${ROUNDS}/plan-stopped?day=${encodeURIComponent(day)}`,
      ),
    );
  }

  /**
   * Ce qui empêche, maintenant, de composer les tournées — sans jour : la
   * flotte et les bacs entiers (2026-10-22). Liste vide, rien ne manque.
   */
  compositionGaps(): Promise<DeliveryCompositionGapsView> {
    return firstValueFrom(this.http.get<DeliveryCompositionGapsView>(`${ROUNDS}/composition-gaps`));
  }

  async open(payload: OpenDeliveryRoundPayload): Promise<void> {
    await firstValueFrom(this.http.post(ROUNDS, payload));
  }

  async assign(roundId: string, payload: AssignDeliveryStopPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${ROUNDS}/${encodeURIComponent(roundId)}/stops`, payload));
  }

  async move(roundId: string, stopId: string, payload: MoveDeliveryStopPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${stopUrl(roundId, stopId)}/move`, payload));
  }

  async reorder(roundId: string, payload: ReorderDeliveryRoundPayload): Promise<void> {
    await firstValueFrom(
      this.http.put(`${ROUNDS}/${encodeURIComponent(roundId)}/sequence`, payload),
    );
  }

  async remove(roundId: string, stopId: string, payload: RemoveDeliveryStopPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${stopUrl(roundId, stopId)}/removal`, payload));
  }

  /** Qui peut conduire : le droit EFFECTIF `delivery_driving:write` (MT-D2 v2). */
  drivers(): Promise<DeliveryDriversView> {
    return firstValueFrom(this.http.get<DeliveryDriversView>(`${ROUNDS}/drivers`));
  }

  async assignDriver(roundId: string, payload: AssignDeliveryDriverPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${ROUNDS}/${encodeURIComponent(roundId)}/driver`, payload));
  }

  async unassignDriver(roundId: string, payload: UnassignDeliveryDriverPayload): Promise<void> {
    await firstValueFrom(
      this.http.post(`${ROUNDS}/${encodeURIComponent(roundId)}/driver/removal`, payload),
    );
  }

  /** « Déclarer rentrée » depuis Tournées (PL2), sous `delivery_rounds:write` — rejouée, pareil. */
  async returnToDepot(roundId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${ROUNDS}/${encodeURIComponent(roundId)}/return`, null));
  }
}
