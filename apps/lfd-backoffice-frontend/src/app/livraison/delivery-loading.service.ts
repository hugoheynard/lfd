import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  DeclareDeliveryBagsPayload,
  DeliveryBagDetailView,
  DeliveryLoadingDayView,
  DeliveryLoadingRoundView,
  DeliveryOrderBagsView,
  LoadDeliveryBagPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const BASE = `${B2B_API_BASE}/admin/livraison`;

function id(value: string): string {
  return encodeURIComponent(value);
}

/**
 * **Les sacs et le chargement** (`plan-preparation-de-tournee.md`, lot 4, v4),
 * sous `delivery_loading`.
 *
 * Aucun état, aucun nouvel essai : un refus remonte tel quel, et c'est l'écran
 * qui le dit puis relit. ⚠️ Aucun décodeur ni générateur de QR ici — ce service
 * est racine, et ce qu'il importe entrerait dans le paquet de démarrage.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryLoadingService {
  private readonly http = inject(HttpClient);

  /** Déclare `count` sacs de plus : ce qui les fait naître (L4-C16). */
  async declareBags(payload: DeclareDeliveryBagsPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${BASE}/sacs`, payload));
  }

  /** Les sacs d'une commande — pour l'étiquetage. Une lecture : imprimer ne crée rien. */
  orderBags(orderId: string): Promise<DeliveryOrderBagsView> {
    return firstValueFrom(
      this.http.get<DeliveryOrderBagsView>(`${BASE}/sacs?commande=${id(orderId)}`),
    );
  }

  /** Ce qu'on voit en ouvrant le QR d'un sac. Ouvrir n'écrit rien (L4-C13). */
  bag(bagId: string): Promise<DeliveryBagDetailView> {
    return firstValueFrom(this.http.get<DeliveryBagDetailView>(`${BASE}/sac/${id(bagId)}`));
  }

  async voidBag(bagId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${BASE}/sacs/${id(bagId)}/annulation`, {}));
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

  async load(roundId: string, payload: LoadDeliveryBagPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${BASE}/chargement/${id(roundId)}/sacs`, payload));
  }

  async unload(roundId: string, bagId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${BASE}/chargement/${id(roundId)}/sacs/${id(bagId)}/dechargement`, {}),
    );
  }

  async depart(roundId: string, version: number): Promise<void> {
    await firstValueFrom(this.http.post(`${BASE}/tournees/${id(roundId)}/depart`, { version }));
  }
}
