import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  EnterPackedResupplyLine,
  PackingResuppliesView,
  ProductionPackingView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Le poste de colisage** d'une journée : les bacs, la ressource, et les gestes
 * qui ferment ou rouvrent une commande.
 *
 * Servi par le bloc colisage depuis K3b (`colisage/colisage.md`
 * §17) : `admin/packing/:date/…`. Les routes du fournil
 * (`admin/production/packing/…`) sont retirées du serveur (K3c) — coche de
 * ligne et compte « + / − » avec elles.
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

  /**
   * **« Il manque »** (lot E6a) : fige ce qui est au bac et l'annonce au
   * commerce, qui attend une décision. La fiche reste ouverte. `409` sur un bac
   * complet ou fermé — le message du serveur se montre tel quel.
   */
  async reportShortfall(date: string, orderId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.orderUrl(date, orderId)}/shortfall`, {}));
  }

  /**
   * **Les fiches de réassort** du jour (lot R3b, écran R3d) — une par
   * réassort d'un point servi par transfert, à part des commandes.
   */
  async resupplies(date: string): Promise<PackingResuppliesView> {
    return firstValueFrom(this.http.get<PackingResuppliesView>(this.resuppliesUrl(date)));
  }

  /**
   * Saisit la quantité **réellement emballée** d'une ligne (≤ demandée, 0
   * permis). `204` ; un refus (`409` : la réserve n'a pas les pièces, fiche
   * close) porte son message.
   */
  async enterResupplyLine(
    date: string,
    resupplyId: string,
    sku: string,
    quantity: number,
  ): Promise<void> {
    const body: EnterPackedResupplyLine = { quantity };
    await firstValueFrom(
      this.http.put<void>(
        `${this.resuppliesUrl(date)}/${encodeURIComponent(resupplyId)}/lines/${encodeURIComponent(sku)}`,
        body,
      ),
    );
  }

  /** **Clôt une fiche de réassort** — refusé tant qu'une ligne n'est pas saisie. */
  async closeResupply(date: string, resupplyId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${this.resuppliesUrl(date)}/${encodeURIComponent(resupplyId)}/close`,
        {},
      ),
    );
  }

  private resuppliesUrl(date: string): string {
    return `${B2B_API_BASE}/admin/packing/${encodeURIComponent(date)}/resupplies`;
  }

  private orderUrl(date: string, orderId: string): string {
    return `${B2B_API_BASE}/admin/packing/${encodeURIComponent(date)}/orders/${encodeURIComponent(orderId)}`;
  }
}
