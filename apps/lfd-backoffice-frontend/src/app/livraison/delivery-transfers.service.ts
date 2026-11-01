import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DayInternalTransfersView, InternalTransferManifestView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les transferts internes**, vus de Livraison → Tournées (plan du transfert
 * interne, lot T1) — sous `delivery_rounds`, le droit de la composition.
 * Les deux lectures s'ouvrent aussi au colisage et à la Supervision
 * (`production_packing:read`, `b2b_supervision:read`, 2026-11-01).
 */
@Injectable({ providedIn: 'root' })
export class DeliveryTransfersService {
  private readonly http = inject(HttpClient);

  /** Ce que le transfert transporte : calculé s'il est prévu, figé s'il est parti. */
  manifest(transferId: string): Promise<InternalTransferManifestView> {
    return firstValueFrom(
      this.http.get<InternalTransferManifestView>(
        `${B2B_API_BASE}/admin/delivery/transfers/${encodeURIComponent(transferId)}/manifest`,
      ),
    );
  }

  /** Les transferts d'une journée — de quoi ouvrir le manifeste depuis l'encadré d'un site. */
  ofDay(day: string): Promise<DayInternalTransfersView> {
    return firstValueFrom(
      this.http.get<DayInternalTransfersView>(`${B2B_API_BASE}/admin/delivery/transfers`, {
        params: { day },
      }),
    );
  }
}
