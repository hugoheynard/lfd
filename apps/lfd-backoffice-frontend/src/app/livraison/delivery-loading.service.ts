import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  DeclareDeliveryBinsPayload,
  DeclaredDeliveryBinsResponse,
  DeliveryBinDetailView,
  DeliveryBinFreeHalvesView,
  DeliveryLoadingDayView,
  DeliveryLoadingPlanView,
  DeliveryLoadingRoundView,
  DeliveryOrderBinsView,
  DeliveryPackingProposalView,
  DeliveryPackingRoundsView,
  LoadDeliveryBinPayload,
  ShareDeliveryBinPayload,
  SharedDeliveryBinResponse,
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
 * Aucun état, aucun nouvel essai : un refus remonte tel quel, et c'est l'écran
 * qui le dit puis relit. ⚠️ Aucun décodeur ni générateur de QR ici — ce service
 * est racine, et ce qu'il importe entrerait dans le paquet de démarrage.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryLoadingService {
  private readonly http = inject(HttpClient);

  /**
   * Déclare des bacs d'un type : `whole` entiers, et une moitié si `half`. Ce
   * qui les fait naître (L4-C16). Rend les bacs créés, dans l'ordre de
   * déclaration — de quoi n'imprimer que leurs étiquettes.
   */
  declareBins(payload: DeclareDeliveryBinsPayload): Promise<DeclaredDeliveryBinsResponse> {
    return firstValueFrom(this.http.post<DeclaredDeliveryBinsResponse>(BINS, payload));
  }

  /** Déclare l'AUTRE moitié d'un bac déjà à moitié pris par un arrêt voisin (v2-4). */
  shareBin(payload: ShareDeliveryBinPayload): Promise<SharedDeliveryBinResponse> {
    return firstValueFrom(this.http.post<SharedDeliveryBinResponse>(`${BINS}/partage`, payload));
  }

  /** Le colisage PROPOSÉ d'une commande (L4b-C4). Une lecture : la déclaration fait foi. */
  packingProposal(orderId: string): Promise<DeliveryPackingProposalView> {
    return firstValueFrom(
      this.http.get<DeliveryPackingProposalView>(
        `${BASE}/colisage/proposition?commande=${id(orderId)}`,
      ),
    );
  }

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

  /** Les moitiés libres aux arrêts consécutifs de la commande, dans sa tournée non partie (v2-4). */
  freeHalves(orderId: string): Promise<DeliveryBinFreeHalvesView> {
    return firstValueFrom(
      this.http.get<DeliveryBinFreeHalvesView>(`${BINS}/partenaires?commande=${id(orderId)}`),
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
