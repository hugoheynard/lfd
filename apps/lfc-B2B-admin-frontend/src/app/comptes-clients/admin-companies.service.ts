import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CompanyContactDraft, CompanyIdentityDraft } from '@lfd/b2b-ui/company';

import { B2B_API_BASE } from '../api/api-config';
import { SuiteEmbed } from '../suite-embed/suite-embed';
import type { AdminCompany } from './admin-company';

/** Audience du token staff demandé au shell (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Accès à la surface **admin** du backend B2B.
 *
 * Auth : on demande au shell un token pour l'audience staff (Invariant C — jamais
 * le token client). Embarqué en prod, le shell le relaie ; standalone ou en dev
 * (bypass backend), `requestToken` rend `null` → aucun en-tête, et le backend en
 * bypass laisse passer. Le jour où l'audience staff existe côté shell, la même
 * ligne fournit le vrai token.
 */
@Injectable({ providedIn: 'root' })
export class AdminCompaniesService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  async list(): Promise<readonly AdminCompany[]> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    const headers = token === null ? {} : { Authorization: `Bearer ${token}` };
    return firstValueFrom(
      this.http.get<readonly AdminCompany[]>(`${B2B_API_BASE}/admin/companies`, { headers }),
    );
  }

  /**
   * Une société par id. Il n'existe pas (encore) d'endpoint détail dédié : on
   * lit la liste et on filtre. `undefined` si l'id est inconnu. À remplacer par
   * `GET /admin/companies/:id` le jour où le backend l'expose.
   */
  async getById(id: string): Promise<AdminCompany | undefined> {
    const companies = await this.list();
    return companies.find((company) => company.id === id);
  }

  /**
   * Crée un compte client (identité + contact principal). Le staff saisit tout :
   * il n'y a pas de profil créateur d'où dériver le contact, contrairement au
   * self-signup client.
   *
   * ⚠️ Endpoint `POST /admin/companies` À CRÉER côté backend : le front est
   * câblé, la surface admin n'expose pour l'instant que la lecture (mutations §3).
   */
  async create(input: {
    readonly identity: CompanyIdentityDraft;
    readonly contact: CompanyContactDraft;
  }): Promise<AdminCompany> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    const headers = token === null ? {} : { Authorization: `Bearer ${token}` };
    const body = { ...input.identity, primaryContact: input.contact };
    return firstValueFrom(
      this.http.post<AdminCompany>(`${B2B_API_BASE}/admin/companies`, body, { headers }),
    );
  }
}
