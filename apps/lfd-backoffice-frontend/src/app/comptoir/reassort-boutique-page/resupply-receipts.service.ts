import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ResupplyArticleView, ResupplyReceiptView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **La réception du réassort boutique** — `/admin/resupply-receipts`, sous le
 * droit du comptoir (`handover_counter`). Les gestes rendent `204` : l'écran
 * relit la liste après chacun. Depuis le lot R2 : « Réceptionner » un
 * réassort et en corriger un écart ; `receive` / `correct` / `withdraw` tiennent
 * le réassort sans commande.
 */
@Injectable({ providedIn: 'root' })
export class ResupplyReceiptsService {
  private readonly http = inject(HttpClient);

  /** Le catalogue publié de la boutique, sans prix. */
  articles(): Promise<readonly ResupplyArticleView[]> {
    return firstValueFrom(this.http.get<readonly ResupplyArticleView[]>(`${this.base()}/articles`));
  }

  read(siteId: string, day: string): Promise<ResupplyReceiptView> {
    return firstValueFrom(this.http.get<ResupplyReceiptView>(this.receipt(siteId, day)));
  }

  /** « Réceptionner » : l'attendu devient le reçu, d'un geste. */
  receiveResupply(siteId: string, resupplyId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.resupply(siteId, resupplyId)}/receive`, {}));
  }

  /** Un écart après réception : le reçu d'une ligne corrigé. */
  correctReceived(
    siteId: string,
    resupplyId: string,
    sku: string,
    quantity: number,
  ): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(
        `${this.resupply(siteId, resupplyId)}/lines/${encodeURIComponent(sku)}`,
        { quantity },
      ),
    );
  }

  receive(siteId: string, day: string, sku: string, quantity: number): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.receipt(siteId, day)}/lines`, { sku, quantity }),
    );
  }

  correct(siteId: string, day: string, sku: string, quantity: number): Promise<void> {
    return firstValueFrom(this.http.patch<void>(this.line(siteId, day, sku), { quantity }));
  }

  withdraw(siteId: string, day: string, sku: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.line(siteId, day, sku)));
  }

  private base(): string {
    return `${B2B_API_BASE}/admin/resupply-receipts`;
  }

  private receipt(siteId: string, day: string): string {
    return `${this.base()}/${encodeURIComponent(siteId)}/${encodeURIComponent(day)}`;
  }

  private resupply(siteId: string, resupplyId: string): string {
    return `${this.base()}/${encodeURIComponent(siteId)}/resupplies/${encodeURIComponent(resupplyId)}`;
  }

  private line(siteId: string, day: string, sku: string): string {
    return `${this.receipt(siteId, day)}/lines/${encodeURIComponent(sku)}`;
  }
}
