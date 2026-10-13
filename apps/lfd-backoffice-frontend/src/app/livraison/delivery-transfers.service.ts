import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { InternalTransferManifestView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les transferts internes**, vus de Livraison → Tournées (plan du transfert
 * interne, lot T1) — sous `delivery_rounds`, le droit de la composition.
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
}
