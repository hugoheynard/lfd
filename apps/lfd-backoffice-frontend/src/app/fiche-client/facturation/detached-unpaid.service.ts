import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DetachedUnpaidOrdersView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/accounting/detached-unpaid`;

/**
 * Les **impayés d'un site détaché** (`plan-sous-comptes.md` §2.1 quater) : les
 * commandes passées au compte d'un principal, écartées du prélèvement parce que
 * le site ne le suit plus. La même lecture sert la fiche du site et celle du
 * principal — le serveur rend ce que `:companyId` a commandé, ou réglait.
 */
@Injectable({ providedIn: 'root' })
export class DetachedUnpaidService {
  private readonly http = inject(HttpClient);

  async ofCompany(companyId: string): Promise<DetachedUnpaidOrdersView> {
    return firstValueFrom(
      this.http.get<DetachedUnpaidOrdersView>(`${BASE}/companies/${encodeURIComponent(companyId)}`),
    );
  }
}
