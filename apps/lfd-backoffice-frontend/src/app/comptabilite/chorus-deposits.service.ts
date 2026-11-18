import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ChorusInvoicesView,
  NoteChorusDepositPayload,
  RejectChorusDepositPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/** Les deux files de la page « Chorus Pro ». */
export type ChorusQueue = 'to-deposit' | 'deposited';

/**
 * **Le dépôt sur Chorus Pro, à la main** (plan
 * `plan-clients-publics-chorus.md`, § 6 quinquies). Lire : `b2b_accounting:read` ;
 * noter un geste : `b2b_accounting:write`. Les trois gestes sont idempotents
 * côté serveur (l'agrégat refuse un second dépôt ou rejet) : pas de clé
 * d'intention.
 */
@Injectable({ providedIn: 'root' })
export class ChorusDepositsService {
  private readonly http = inject(HttpClient);

  async list(queue: ChorusQueue, legalEntityId?: string): Promise<ChorusInvoicesView> {
    const params =
      legalEntityId === undefined
        ? new HttpParams()
        : new HttpParams().set('legalEntityId', legalEntityId);
    return firstValueFrom(
      this.http.get<ChorusInvoicesView>(
        `${B2B_API_BASE}/admin/accounting/chorus/invoices/${queue}`,
        {
          params,
        },
      ),
    );
  }

  /** « Déposée le … » */
  async deposit(invoiceId: string, payload: NoteChorusDepositPayload): Promise<void> {
    await this.post(invoiceId, 'deposit', payload);
  }

  /** « Rejetée par Chorus » — le jour et le motif du portail. */
  async reject(invoiceId: string, payload: RejectChorusDepositPayload): Promise<void> {
    await this.post(invoiceId, 'rejection', payload);
  }

  /** « Mise en paiement » — informatif. */
  async accept(invoiceId: string, payload: NoteChorusDepositPayload): Promise<void> {
    await this.post(invoiceId, 'acceptance', payload);
  }

  private async post(
    invoiceId: string,
    gesture: 'deposit' | 'rejection' | 'acceptance',
    payload: NoteChorusDepositPayload | RejectChorusDepositPayload,
  ): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/accounting/chorus/invoices/${encodeURIComponent(invoiceId)}/${gesture}`,
        payload,
      ),
    );
  }
}
