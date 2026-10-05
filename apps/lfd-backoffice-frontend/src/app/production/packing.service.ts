import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ProductionPackingView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Le poste de colisage** d'une journée : les bacs, la ressource, et les gestes
 * qui ferment ou rouvrent une commande.
 *
 * Servi par le bloc colisage depuis K3b (`colisage/plan-domaine-colisage.md`
 * §17) : `admin/packing/:date/…`. Les routes du fournil
 * (`admin/production/packing/…`) ne sont plus appelées d'ici — coche de ligne
 * et compte « + / − » ont disparu avec elles.
 *
 * Aucun état gardé ici, et aucun chiffre fabriqué : un geste part directement,
 * et l'écran relit ce que le serveur a calculé.
 */
@Injectable({ providedIn: 'root' })
export class PackingService {
  private readonly http = inject(HttpClient);

  /**
   * Les bacs **et** la ressource d'une journée de service (`AAAA-MM-JJ`), en une
   * lecture — la balance n'a de sens que si ses deux plateaux viennent du même
   * instant.
   */
  async packing(date: string): Promise<ProductionPackingView> {
    return firstValueFrom(
      this.http.get<ProductionPackingView>(
        `${B2B_API_BASE}/admin/packing/${encodeURIComponent(date)}/board`,
      ),
    );
  }

  /**
   * **Déclare la commande prête** — « fermer » au colisage. `204` ; un `409`
   * (`packing.containers.unallocated`) dit qu'il reste des pièces à répartir.
   *
   * ⚠️ « Prête » à l'écran, `packed` côté serveur : le colisage publie
   * `packing.order_packed`, le commerce en tire `ready`. L'écran nomme l'EFFET.
   */
  async closeOrder(date: string, orderId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.orderUrl(date, orderId)}/close`, {}));
  }

  /**
   * **Rouvre le rangement** d'une commande fermée. La commande reste prête au
   * commerce : aucun fait n'est publié. Refusé (`409`) si un de ses bacs est
   * chargé ou sa tournée partie — le message du serveur se montre tel quel.
   */
  async reopenOrder(date: string, orderId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.orderUrl(date, orderId)}/reopen`, {}));
  }

  private orderUrl(date: string, orderId: string): string {
    return `${B2B_API_BASE}/admin/packing/${encodeURIComponent(date)}/orders/${encodeURIComponent(orderId)}`;
  }
}
