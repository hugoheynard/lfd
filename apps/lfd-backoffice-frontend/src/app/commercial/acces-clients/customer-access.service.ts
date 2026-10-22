import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CustomerAccessRowView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * La lecture de la page « Accès clients ». La relance, elle, passe par
 * `AdminCompaniesService.inviteMember` — le même appel que la fiche, pour qu'il
 * n'existe qu'une façon d'ouvrir ou de renvoyer un accès.
 */
@Injectable({ providedIn: 'root' })
export class CustomerAccessService {
  private readonly http = inject(HttpClient);

  list(): Promise<readonly CustomerAccessRowView[]> {
    return firstValueFrom(
      this.http.get<readonly CustomerAccessRowView[]>(`${B2B_API_BASE}/admin/customer-access`),
    );
  }
}
