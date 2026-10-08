import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { BillingStatementView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Les **arrêtés de facturation figés** — le dossier d'une ligne de prélèvement
 * (plan `documentation/comptabilite/facturation/le-prelevement-suit-la-facture.md`).
 * Une relecture : le serveur ne recalcule rien, l'écran non plus.
 */
@Injectable({ providedIn: 'root' })
export class BillingStatementsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/billing-statements`;

  async one(statementId: string): Promise<BillingStatementView> {
    return firstValueFrom(
      this.http.get<BillingStatementView>(`${this.base}/${encodeURIComponent(statementId)}`),
    );
  }
}
