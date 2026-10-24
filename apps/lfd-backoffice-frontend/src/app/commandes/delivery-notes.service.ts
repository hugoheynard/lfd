import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { StaffNote } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les bons de livraison d'une commande** (plan
 * `documentation/commandes/plan-e5a-le-bon-de-livraison-imprime.md`, § 3) :
 * la liste, le BL de transport à imprimer, le BL chiffré à télécharger. Sous
 * `b2b_orders:read`, le droit qui ouvre déjà la fiche.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryNotesService {
  private readonly http = inject(HttpClient);

  ofOrder(orderId: string): Promise<readonly StaffNote[]> {
    return firstValueFrom(this.http.get<readonly StaffNote[]>(this.base(orderId)));
  }

  /** Le BL de transport — aucun montant. */
  carrierPdf(orderId: string, noteNumber: string): Promise<Blob> {
    return this.pdf(orderId, noteNumber, 'carrier');
  }

  /** Le BL chiffré — celui du client. */
  clientPdf(orderId: string, noteNumber: string): Promise<Blob> {
    return this.pdf(orderId, noteNumber, 'client');
  }

  private pdf(orderId: string, noteNumber: string, file: 'carrier' | 'client'): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.base(orderId)}/${encodeURIComponent(noteNumber)}/${file}.pdf`, {
        responseType: 'blob',
      }),
    );
  }

  private base(orderId: string): string {
    return `${B2B_API_BASE}/admin/orders/${encodeURIComponent(orderId)}/delivery-notes`;
  }
}
