import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/**
 * Le **bon de livraison chiffré** d'une commande remise, tel que le serveur le
 * fabrique (plan E5a (`documentation/commandes/bon-de-livraison.md`),
 * § 3). Le mur de la commande est appliqué derrière : une commande d'une
 * autre société, ou pas encore remise, rend 404.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryNoteService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  async pdfOf(orderId: string): Promise<Blob> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return firstValueFrom(
      this.http.get(
        `${AUTH_CONFIG.apiBaseUrl}/orders/${encodeURIComponent(orderId)}/delivery-note.pdf`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' },
      ),
    );
  }
}
