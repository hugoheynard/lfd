import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  PurchaseBinCandidatePayload,
  PurchaseBinCandidatesView,
  PurchaseTablePayload,
  PurchaseTableView,
  PurchaseVehicleCandidatePayload,
  PurchaseVehicleCandidatesView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const LIBRARY = `${B2B_API_BASE}/admin/livraison/bibliotheque`;
const VEHICLES = `${LIBRARY}/vehicules`;
const BINS = `${LIBRARY}/bacs`;
const TABLE = `${B2B_API_BASE}/admin/livraison/assistant-achat/tableau`;

/**
 * **La bibliothèque d'achat et son tableau croisé**
 * (`documentation/livraisons/plan-bibliotheque-d-achat.md`, B-D1 et B-D4).
 * Lecture et tableau sous `delivery_rounds:read`, écriture sous
 * `delivery_rounds:write` (B-D6).
 *
 * Aucun état, et les refus du serveur remontent tels quels : c'est le domaine
 * qui tient les bornes, et sa phrase est celle que l'écran montre.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseLibraryService {
  private readonly http = inject(HttpClient);

  vehicleCandidates(includeArchived: boolean): Promise<PurchaseVehicleCandidatesView> {
    return firstValueFrom(
      this.http.get<PurchaseVehicleCandidatesView>(VEHICLES, { params: archives(includeArchived) }),
    );
  }

  async addVehicleCandidate(payload: PurchaseVehicleCandidatePayload): Promise<void> {
    await firstValueFrom(this.http.post(VEHICLES, payload));
  }

  async updateVehicleCandidate(
    id: string,
    payload: PurchaseVehicleCandidatePayload,
  ): Promise<void> {
    await firstValueFrom(this.http.put(`${VEHICLES}/${encodeURIComponent(id)}`, payload));
  }

  async archiveVehicleCandidate(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${VEHICLES}/${encodeURIComponent(id)}/archiver`, {}));
  }

  async reactivateVehicleCandidate(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${VEHICLES}/${encodeURIComponent(id)}/reactiver`, {}));
  }

  binCandidates(includeArchived: boolean): Promise<PurchaseBinCandidatesView> {
    return firstValueFrom(
      this.http.get<PurchaseBinCandidatesView>(BINS, { params: archives(includeArchived) }),
    );
  }

  async addBinCandidate(payload: PurchaseBinCandidatePayload): Promise<void> {
    await firstValueFrom(this.http.post(BINS, payload));
  }

  async updateBinCandidate(id: string, payload: PurchaseBinCandidatePayload): Promise<void> {
    await firstValueFrom(this.http.put(`${BINS}/${encodeURIComponent(id)}`, payload));
  }

  async archiveBinCandidate(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${BINS}/${encodeURIComponent(id)}/archiver`, {}));
  }

  async reactivateBinCandidate(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${BINS}/${encodeURIComponent(id)}/reactiver`, {}));
  }

  /** Un POST parce que la sélection est un corps, mais une LECTURE : rien n'est écrit. */
  table(payload: PurchaseTablePayload): Promise<PurchaseTableView> {
    return firstValueFrom(this.http.post<PurchaseTableView>(TABLE, payload));
  }
}

/** `?archives=inclure`, ou rien : sans, la liste n'a que les candidats en cours. */
function archives(include: boolean): Record<string, string> {
  return include ? { archives: 'inclure' } : {};
}
