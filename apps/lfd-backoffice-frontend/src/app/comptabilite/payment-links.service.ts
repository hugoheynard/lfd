import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AccountingSettingsView,
  CreatedPaymentLink,
  CreatePaymentLinkPayload,
  OrderAwaitingPaymentView,
  PaymentLinkView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Accès à la surface **staff** des liens de paiement et des réglages de la
 * comptabilité.
 *
 * Transport pur : les refus (plafond dépassé, lien déjà réglé, adresse publique
 * absente) sont rédigés par le serveur, et l'écran les affiche tels quels.
 * Plan : `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §2.
 */
@Injectable({ providedIn: 'root' })
export class PaymentLinksService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/payment-links`;
  private readonly settingsUrl = `${B2B_API_BASE}/admin/accounting/settings`;

  /** Les commandes à régler par carte (`pending` ou `failed`, non annulées). */
  async listOrders(): Promise<readonly OrderAwaitingPaymentView[]> {
    return firstValueFrom(
      this.http.get<readonly OrderAwaitingPaymentView[]>(`${this.base}/orders`),
    );
  }

  async resendOrderLink(orderId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/orders/${orderId}/resend`, {}));
  }

  async listLinks(): Promise<readonly PaymentLinkView[]> {
    return firstValueFrom(this.http.get<readonly PaymentLinkView[]>(this.base));
  }

  async createLink(payload: CreatePaymentLinkPayload): Promise<CreatedPaymentLink> {
    return firstValueFrom(this.http.post<CreatedPaymentLink>(this.base, payload));
  }

  async cancelLink(id: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/${id}/cancel`, {}));
  }

  async readSettings(): Promise<AccountingSettingsView> {
    return firstValueFrom(this.http.get<AccountingSettingsView>(this.settingsUrl));
  }

  async saveSettings(settings: AccountingSettingsView): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.settingsUrl, settings));
  }
}
