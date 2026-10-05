import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CollectionForm,
  CompanyFollowAspect,
  CompanyHierarchyView,
  CreatedIdResponse,
  CreateSubAccountPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { AdminCompaniesService } from './admin-companies.service';

/**
 * Les **sous-comptes**, vus du back-office (`plan-sous-comptes.md`, lot S2) :
 * créer, rattacher, détacher, suivre un aspect du principal, et la case
 * « Compte de groupe, sans livraison ».
 *
 * Un service à part d'`AdminCompaniesService` : la hiérarchie a ses propres
 * routes, et le tarif suivi vit sur une AUTRE surface (`b2b_pricing`, Q9).
 * Le service ne fait que le transport ; il ne décide d'aucun droit — le
 * serveur refuse, l'écran cache.
 */
@Injectable({ providedIn: 'root' })
export class AdminCompanyHierarchyService {
  private readonly http = inject(HttpClient);
  private readonly companies = inject(AdminCompaniesService);

  /**
   * La place d'une société dans la hiérarchie, lue sur sa fiche — il n'existe
   * pas de route dédiée : `GET /admin/companies/:id` la porte (`hierarchy`).
   * `undefined` si la société est inconnue.
   */
  async hierarchyOf(companyId: string): Promise<CompanyHierarchyView | undefined> {
    return (await this.companies.getById(companyId))?.hierarchy;
  }

  /** Crée un sous-compte de `parentId`. Rend son identifiant. */
  async createSubAccount(parentId: string, payload: CreateSubAccountPayload): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(`${this.base(parentId)}/sub-accounts`, payload),
    );
    return created.id;
  }

  /** Rattache `companyId` comme sous-compte de `parentId`. */
  async attach(companyId: string, parentId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base(companyId)}/parent`, { parentId }));
  }

  /** Détache `companyId` de son principal : toutes ses périodes de suivi se ferment. */
  async detach(companyId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base(companyId)}/parent/detach`, {}));
  }

  /**
   * Suit (ou cesse de suivre) un aspect du principal.
   *
   * `pricing` part sur SA route, derrière le droit de tarification (Q9) ; les
   * deux autres sur celle de la fiche. Une seule entrée pour l'écran, pour
   * qu'aucun appelant n'ait à se souvenir de la différence.
   */
  async setFollowing(
    companyId: string,
    aspect: CompanyFollowAspect,
    following: boolean,
  ): Promise<void> {
    if (aspect === 'pricing') {
      const url = `${this.base(companyId)}/pricing-follow${following ? '' : '/stop'}`;
      await firstValueFrom(this.http.post<void>(url, {}));
      return;
    }
    const url = `${this.base(companyId)}/follows${following ? '' : '/stop'}`;
    await firstValueFrom(this.http.post<void>(url, { aspect }));
  }

  /** La case « Compte de groupe, sans livraison » (§4, R6). */
  async setGroupWithoutDelivery(companyId: string, enabled: boolean): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base(companyId)}/group-without-delivery`, { enabled }),
    );
  }

  /**
   * La forme de prélèvement d'un site qui suit `billing` (§2.1 ter) : décision
   * datée, à l'instant du geste. Le serveur refuse (`409`) un compte qui paie
   * seul ; reposer la forme en vigueur n'écrit rien.
   */
  async setCollectionForm(companyId: string, form: CollectionForm): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base(companyId)}/collection-form`, { form }));
  }

  private base(companyId: string): string {
    return `${B2B_API_BASE}/admin/companies/${companyId}`;
  }
}
