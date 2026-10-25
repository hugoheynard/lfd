import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { StaffNote } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/** Combien de temps garder l'adresse d'un PDF ouvert avant de la libérer. */
export const BLOB_LIFETIME_MS = 60_000;

/** Ce que l'écran dit d'un BL imprimé puis changé (plan E6, § 14). */
export const REPRINT_SENTENCE =
  'Le bon de livraison a changé depuis son impression — réimprimez-le.';

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

  /**
   * Ouvre le BL de transport dans un onglet, d'où on l'imprime. Le serveur
   * trace l'impression (plan E6, § 14) : relire la liste fait alors tomber
   * « réimprimez-le ».
   */
  async openCarrier(orderId: string, noteNumber: string): Promise<void> {
    const url = URL.createObjectURL(await this.carrierPdf(orderId, noteNumber));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, BLOB_LIFETIME_MS);
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
