import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  DeliveryBinFreeHalvesView,
  MovePackingPieces,
  OpenedPackingContainer,
  OpenPackingContainer,
  TransferPackingPieces,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **La colonne Contenants du poste de colisage** (K2b,
 * `colisage/colisage.md` §5–§5.1) : créer un bac ou un sac,
 * y répartir des pièces, les en retirer, annuler un contenant, proposer, partager une moitié.
 *
 * Séparé de `PackingService` parce que les routes vivent sous une autre
 * racine (`admin/packing/:date/orders/:orderId`, servie par le bloc
 * colisage) et parlent de l'identifiant de commande, pas de la référence.
 *
 * Aucun état ici : chaque geste part, et le poste se RELIT par
 * `GET admin/packing/:date/board`.
 */
@Injectable({ providedIn: 'root' })
export class PackingContainersService {
  private readonly http = inject(HttpClient);

  /** Un contenant de plus ; rend son identifiant. */
  async open(date: string, orderId: string, body: OpenPackingContainer): Promise<string> {
    const opened = await firstValueFrom(
      this.http.post<OpenedPackingContainer>(`${this.orderUrl(date, orderId)}/containers`, body),
    );
    return opened.containerId;
  }

  /** Répartit `quantity` pièces d'une ligne dans un contenant. */
  async allocate(
    date: string,
    orderId: string,
    containerId: string,
    sku: string,
    quantity: number,
  ): Promise<void> {
    const body: MovePackingPieces = { quantity };
    await firstValueFrom(this.http.post<void>(this.lineUrl(date, orderId, containerId, sku), body));
  }

  /** Retire `quantity` pièces d'une ligne d'un contenant. */
  async withdraw(
    date: string,
    orderId: string,
    containerId: string,
    sku: string,
    quantity: number,
  ): Promise<void> {
    const body: MovePackingPieces = { quantity };
    await firstValueFrom(
      this.http.post<void>(`${this.lineUrl(date, orderId, containerId, sku)}/withdrawal`, body),
    );
  }

  /** Déplace `quantity` pièces d'une ligne vers un autre contenant de la même commande. */
  async transfer(
    date: string,
    orderId: string,
    fromContainerId: string,
    sku: string,
    toContainerId: string,
    quantity: number,
  ): Promise<void> {
    const body: TransferPackingPieces = { toContainerId, quantity };
    await firstValueFrom(
      this.http.post<void>(`${this.lineUrl(date, orderId, fromContainerId, sku)}/transfer`, body),
    );
  }

  /** Annule un contenant — un bac l'est d'abord chez la livraison, qui peut refuser. */
  async void(date: string, orderId: string, containerId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${this.orderUrl(date, orderId)}/containers/${encodeURIComponent(containerId)}/void`,
        {},
      ),
    );
  }

  /**
   * « Proposer », appliqué par le serveur d'un coup (plan §7) : les bacs
   * proposés naissent et se remplissent bac par bac, ou rien n'est écrit.
   */
  async applyProposal(date: string, orderId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.orderUrl(date, orderId)}/proposal/apply`, {}),
    );
  }

  /** Les moitiés libres des arrêts voisins — à partager ; la livraison seulement. */
  shareableHalves(date: string, orderId: string): Promise<DeliveryBinFreeHalvesView> {
    return firstValueFrom(
      this.http.get<DeliveryBinFreeHalvesView>(`${this.orderUrl(date, orderId)}/shareable-halves`),
    );
  }

  private orderUrl(date: string, orderId: string): string {
    return `${B2B_API_BASE}/admin/packing/${encodeURIComponent(date)}/orders/${encodeURIComponent(orderId)}`;
  }

  private lineUrl(date: string, orderId: string, containerId: string, sku: string): string {
    return `${this.orderUrl(date, orderId)}/containers/${encodeURIComponent(containerId)}/lines/${encodeURIComponent(sku)}`;
  }
}
