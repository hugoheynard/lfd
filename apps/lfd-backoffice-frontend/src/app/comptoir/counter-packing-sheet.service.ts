import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CounterPackingSheetView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/** Le refus nommé du serveur : la commande n'a pas (encore) de fiche de colis. */
export const SHEET_NOT_FOUND_CODE = 'packing.counter.sheet_not_found';

/**
 * **La fiche de colis d'une commande, au comptoir** —
 * `GET /admin/counter/orders/:orderId/packing-sheet`, sous `handover_counter:read`.
 *
 * Remplace pour le rail la lecture du poste entier du colisage (constat du
 * 2026-11-03 : tout le board pour une fiche, et un 403 au vendeur qui n'a que
 * le comptoir — le rail proposait alors une remise complète sur un sac
 * incomplet).
 */
@Injectable({ providedIn: 'root' })
export class CounterPackingSheetService {
  private readonly http = inject(HttpClient);

  /** `null` = aucune fiche : plan pas arrêté, ou commande hors plan. Tout autre refus remonte. */
  async sheet(orderId: string): Promise<CounterPackingSheetView | null> {
    try {
      return await firstValueFrom(
        this.http.get<CounterPackingSheetView>(
          `${B2B_API_BASE}/admin/counter/orders/${encodeURIComponent(orderId)}/packing-sheet`,
        ),
      );
    } catch (error: unknown) {
      if (isSheetNotFound(error)) {
        return null;
      }
      throw error;
    }
  }
}

function isSheetNotFound(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
    return false;
  }
  const body: unknown = error.error;
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    body.code === SHEET_NOT_FOUND_CODE
  );
}
