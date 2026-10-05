import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  DeliveryBinDetailView,
  DeliveryLoadingDayView,
  DeliveryLoadingPlanView,
  DeliveryLoadingRoundView,
  DeliveryOrderBinsView,
  DeliveryPackingRoundsView,
  LoadDeliveryBinPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const BASE = `${B2B_API_BASE}/admin/livraison`;
/** Les bacs DÉCLARÉS — `admin/livraison/bacs` est le catalogue des types (tranche A). */
const BINS = `${BASE}/colisage/bacs`;

function id(value: string): string {
  return encodeURIComponent(value);
}

/**
 * **Les bacs déclarés et le chargement** (`plan-preparation-de-tournee.md`,
 * lot 4, v4 ; lot 4 bis, tranche B), sous `delivery_loading`.
 *
 * Plus de déclaration ni de partage de bac d'ici depuis K3c
 * (`colisage.md` §17.3) : les bacs naissent au colisage, par ses
 * contenants. L'écran ne déclarait que pour une commande `counted`, désormais
 * en lecture seule.
 *
 * Aucun état, aucun nouvel essai : un refus remonte tel quel, et c'est l'écran
 * qui le dit puis relit. ⚠️ Aucun décodeur ni générateur de QR ici — ce service
 * est racine, et ce qu'il importe entrerait dans le paquet de démarrage.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryLoadingService {
  private readonly http = inject(HttpClient);

  /**
   * Les tournées du jour vues du poste de colisage (lot PC2) : les arrêts du
   * dernier au premier, « n prêtes sur m », « à refaire ». Sous
   * `production_packing:read` OU `delivery_loading:read`.
   */
  packingRounds(day: string): Promise<DeliveryPackingRoundsView> {
    return firstValueFrom(
      this.http.get<DeliveryPackingRoundsView>(`${BASE}/colisage/tournees?jour=${id(day)}`),
    );
  }

  /** Les bacs d'une commande — pour l'étiquetage. Une lecture : imprimer ne crée rien. */
  orderBins(orderId: string): Promise<DeliveryOrderBinsView> {
    return firstValueFrom(this.http.get<DeliveryOrderBinsView>(`${BINS}?commande=${id(orderId)}`));
  }

  /** Ce qu'on voit en ouvrant le QR d'un bac. Ouvrir n'écrit rien (L4-C13). */
  bin(binId: string): Promise<DeliveryBinDetailView> {
    return firstValueFrom(this.http.get<DeliveryBinDetailView>(`${BINS}/${id(binId)}`));
  }

  async voidBin(binId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${BINS}/${id(binId)}/annulation`, {}));
  }

  /** Les tournées d'un jour, vues du dépôt — sous `delivery_loading:read` seul. */
  day(day: string): Promise<DeliveryLoadingDayView> {
    return firstValueFrom(
      this.http.get<DeliveryLoadingDayView>(`${BASE}/chargement?jour=${id(day)}`),
    );
  }

  round(roundId: string): Promise<DeliveryLoadingRoundView> {
    return firstValueFrom(
      this.http.get<DeliveryLoadingRoundView>(`${BASE}/chargement/${id(roundId)}`),
    );
  }

  /** Le plan de chargement (L4b-C7, v2-5) : un ordre SUGGÉRÉ et un volume. Une lecture. */
  plan(roundId: string): Promise<DeliveryLoadingPlanView> {
    return firstValueFrom(
      this.http.get<DeliveryLoadingPlanView>(`${BASE}/chargement/${id(roundId)}/plan`),
    );
  }

  async load(roundId: string, payload: LoadDeliveryBinPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${BASE}/chargement/${id(roundId)}/bacs`, payload));
  }

  async unload(roundId: string, binId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${BASE}/chargement/${id(roundId)}/bacs/${id(binId)}/dechargement`, {}),
    );
  }

  async depart(roundId: string, version: number): Promise<void> {
    await firstValueFrom(this.http.post(`${BASE}/tournees/${id(roundId)}/depart`, { version }));
  }
}
