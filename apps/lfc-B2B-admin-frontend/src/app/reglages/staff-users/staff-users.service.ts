import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedStaffUserResponse,
  StaffStatusChange,
  StaffUserPayload,
  StaffUserView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Annuaire **staff** (back-office) — CRUD entièrement staff-gated (aucune surface
 * publique). Source de vérité **locale** : c'est cette table qui décide des
 * accès, Auth0 ne dit que « qui es-tu ».
 */
@Injectable({ providedIn: 'root' })
export class StaffUsersService {
  private readonly http = inject(HttpClient);

  /** Liste les users staff (triés par nom). Staff-gated. */
  async list(): Promise<readonly StaffUserView[]> {
    return firstValueFrom(
      this.http.get<readonly StaffUserView[]>(`${B2B_API_BASE}/admin/staff-users`),
    );
  }

  /** Crée un user staff. */
  async create(payload: StaffUserPayload): Promise<CreatedStaffUserResponse> {
    return firstValueFrom(
      this.http.post<CreatedStaffUserResponse>(`${B2B_API_BASE}/admin/staff-users`, payload),
    );
  }

  /** Édite un user staff. */
  async update(id: string, payload: StaffUserPayload): Promise<void> {
    await firstValueFrom(this.http.patch<void>(`${B2B_API_BASE}/admin/staff-users/${id}`, payload));
  }

  /**
   * Suspend une personne, ou la réintègre. Geste distinct de l'édition : on ne
   * ferme pas un accès en enregistrant un formulaire de coordonnées.
   */
  async setStatus(id: string, change: StaffStatusChange): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/staff-users/${id}/status`, change),
    );
  }

  /**
   * Invite une personne, ou lui **renvoie** un lien : c'est le même appel. Le
   * serveur sait déjà lequel des deux s'applique, selon qu'une identité existe.
   * L'écran n'a pas à le deviner — il se tromperait dès qu'un second onglet est
   * ouvert sur la même fiche.
   */
  async invite(id: string): Promise<{ mailSent: boolean }> {
    return firstValueFrom(
      this.http.post<{ mailSent: boolean }>(
        `${B2B_API_BASE}/admin/staff-users/${id}/invitation`,
        {},
      ),
    );
  }

  /**
   * Fabrique un lien **sans l'envoyer**, pour le remettre de la main à la main.
   *
   * Le canal e-mail muet n'est pas le seul cas : donner le lien de vive voix au
   * téléphone est une façon normale de dépanner quelqu'un. Le lien vaut prise de
   * contrôle du compte — il ne se stocke jamais, il se refabrique à la demande,
   * et le neuf tue le précédent.
   */
  async issueLink(id: string): Promise<{ url: string; expiresAt: string }> {
    return firstValueFrom(
      this.http.post<{ url: string; expiresAt: string }>(
        `${B2B_API_BASE}/admin/staff-access-pending/${id}/link`,
        {},
      ),
    );
  }

  /** Supprime un user staff. */
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${B2B_API_BASE}/admin/staff-users/${id}`));
  }
}
