import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import type { IssuedLinkResponse, PendingAccessView, PendingStaffAccessView } from '@lfd/contracts';

import type { PendingAccess } from './pending-access.model';

/** La file des accès à remettre, et la fabrique de liens. */
@Injectable({ providedIn: 'root' })
export class PendingAccessService {
  private readonly http = inject(HttpClient);

  /**
   * Les deux files, réunies à l'affichage seulement.
   *
   * `allSettled` et non `all` : un commercial n'a pas le droit de lire
   * l'annuaire staff, et un 403 sur cette moitié-là ne doit pas lui vider
   * l'écran. Chacune apparaît si elle est lisible.
   */
  async list(): Promise<readonly PendingAccess[]> {
    const [clients, staff] = await Promise.allSettled([
      firstValueFrom(
        this.http.get<readonly PendingAccessView[]>(`${B2B_API_BASE}/admin/access-pending`),
      ),
      firstValueFrom(
        this.http.get<readonly PendingStaffAccessView[]>(
          `${B2B_API_BASE}/admin/staff-access-pending`,
        ),
      ),
    ]);
    return [
      ...(clients.status === 'fulfilled' ? clients.value.map(toClient) : []),
      ...(staff.status === 'fulfilled' ? staff.value.map(toStaff) : []),
    ].sort((a, b) => a.invitedAt.localeCompare(b.invitedAt));
  }

  /**
   * Fabrique un lien **frais**. `POST` et non `GET` : ça crée un porteur de
   * droits à usage unique, et un `GET` finirait préchargé, mis en cache et
   * rangé dans l'historique du navigateur.
   */
  async issueLink(person: PendingAccess): Promise<IssuedLinkResponse> {
    // Deux annuaires, deux routes : la personne porte d'où elle vient, l'écran
    // n'a pas à le deviner.
    const base =
      person.kind === 'staff'
        ? `${B2B_API_BASE}/admin/staff-access-pending`
        : `${B2B_API_BASE}/admin/access-pending`;
    return firstValueFrom(this.http.post<IssuedLinkResponse>(`${base}/${person.userId}/link`, {}));
  }
}

function toClient(row: PendingAccessView): PendingAccess {
  return { ...row, kind: 'client' };
}

function toStaff(row: PendingStaffAccessView): PendingAccess {
  return {
    userId: row.staffUserId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    companyId: null,
    // Sa fonction situe un membre de l'équipe comme la société situe un client.
    companyName: row.jobTitle === '' ? 'Équipe' : row.jobTitle,
    invitedAt: row.invitedAt,
    kind: 'staff',
  };
}
