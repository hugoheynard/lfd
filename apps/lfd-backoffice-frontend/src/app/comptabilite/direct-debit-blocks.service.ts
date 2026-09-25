import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DirectDebitBlockView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Accès à la surface **staff** des blocages du prélèvement mensuel.
 *
 * Transport pur : les refus (déjà bloqué, aucun crédit accordé, non bloqué)
 * sont rédigés par l'agrégat `Company`, et l'écran les affiche tels quels.
 * Plan : `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §1.
 */
@Injectable({ providedIn: 'root' })
export class DirectDebitBlocksService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/direct-debit-blocks`;

  /** Les sociétés au crédit mensuel, bloquées ou non. */
  async list(): Promise<readonly DirectDebitBlockView[]> {
    return firstValueFrom(this.http.get<readonly DirectDebitBlockView[]>(this.base));
  }

  async block(companyId: string, reason: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/${companyId}`, { reason }));
  }

  async unblock(companyId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base}/${companyId}`));
  }
}
