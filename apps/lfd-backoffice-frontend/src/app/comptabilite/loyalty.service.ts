import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdjustLoyaltyPointsPayload,
  LoyaltyBalanceView,
  LoyaltySettingsView,
  LoyaltyVoucherView,
  SetLoyaltySettingsPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Accès à la surface **staff** de la fidélité : le réglage du programme, les
 * soldes par titulaire, les bons émis, l'ajustement motivé et l'annulation
 * d'un bon.
 *
 * Transport pur : les refus (solde qui passerait sous zéro, bon qui n'est plus
 * disponible) sont rédigés par le serveur, et l'écran les affiche tels quels.
 * Plan : `documentation/comptabilite/plan-points-de-fidelite.md`, lot B.
 */
@Injectable({ providedIn: 'root' })
export class LoyaltyService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/loyalty`;

  async readSettings(): Promise<LoyaltySettingsView> {
    return firstValueFrom(this.http.get<LoyaltySettingsView>(`${this.base}/settings`));
  }

  async saveSettings(payload: SetLoyaltySettingsPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/settings`, payload));
  }

  async listBalances(): Promise<readonly LoyaltyBalanceView[]> {
    return firstValueFrom(this.http.get<readonly LoyaltyBalanceView[]>(`${this.base}/balances`));
  }

  async listVouchers(): Promise<readonly LoyaltyVoucherView[]> {
    return firstValueFrom(this.http.get<readonly LoyaltyVoucherView[]>(`${this.base}/vouchers`));
  }

  async adjust(payload: AdjustLoyaltyPointsPayload): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/adjustments`, payload));
  }

  async cancelVoucher(id: string, reason: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/vouchers/${encodeURIComponent(id)}/cancel`, { reason }),
    );
  }
}
