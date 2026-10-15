import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AGENT_TOOL_HEADER } from '@lfd/contracts';
import type { CreateStaffRolePayload, StaffRoleView, UpdateStaffRolePayload } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Les **rôles** du back-office. Entièrement staff-gated, sur la même ressource
 * que l'annuaire (`staff`) : définir un droit et l'attribuer sont le même
 * pouvoir vu de deux côtés.
 */
@Injectable({ providedIn: 'root' })
export class StaffRolesService {
  private readonly http = inject(HttpClient);

  /** Tous les rôles, `superadmin` compris — lui est synthétisé par le serveur. */
  async list(): Promise<readonly StaffRoleView[]> {
    return firstValueFrom(
      this.http.get<readonly StaffRoleView[]>(`${B2B_API_BASE}/admin/staff-roles`),
    );
  }

  async create(payload: CreateStaffRolePayload): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${B2B_API_BASE}/admin/staff-roles`, payload));
  }

  /**
   * La clé n'est pas dans la charge : elle ne se renomme pas.
   *
   * `agentTool` — posé par un outil agent seulement (`x-lfd-agent-tool`) : le
   * serveur le range dans le fait du journal. L'écran ne le passe pas.
   */
  async update(key: string, payload: UpdateStaffRolePayload, agentTool?: string): Promise<void> {
    const headers =
      agentTool === undefined ? undefined : new HttpHeaders({ [AGENT_TOOL_HEADER]: agentTool });
    await firstValueFrom(
      this.http.put<void>(
        `${B2B_API_BASE}/admin/staff-roles/${key}`,
        payload,
        headers === undefined ? {} : { headers },
      ),
    );
  }

  /** Archive — le serveur refuse tant que des personnes portent le rôle. */
  async archive(key: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${B2B_API_BASE}/admin/staff-roles/${key}`));
  }

  async restore(key: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${B2B_API_BASE}/admin/staff-roles/${key}/restore`, {}),
    );
  }
}
